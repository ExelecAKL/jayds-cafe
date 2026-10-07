/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated hook doubles represent heterogeneous React state and runtime JSX props. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual client components with isolated hook/session/network doubles.
// No .env, Supabase account, browser storage, or provider is touched.
const nodeRequire = createRequire(import.meta.url);
const accountA = { id: "account-a", email: "a@example.test" };
const accountB = { id: "account-b", email: "b@example.test" };
type Auth = {
  user: typeof accountA | null;
  session: { user: typeof accountA; access_token: string } | null;
  profile: { id: string; full_name: string; phone: string } | null;
  initialized: boolean;
};
const authFor = (user = accountA): Auth => ({
  user,
  session: { user, access_token: `token-${user.id}` },
  profile: { id: user.id, full_name: user.id, phone: "09123456789" },
  initialized: true,
});
type Element = { type: unknown; key?: string; props: Record<string, any> };
function hooks() {
  let index = 0,
    dirty = true,
    result: Element;
  const slots: any[] = [],
    pending: (() => void)[] = [];
  let component: () => Element = () => {
    throw Error("Missing component");
  };
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useContext: () => null,
    useState(initial: unknown) {
      const position = index++;
      if (!(position in slots))
        slots[position] =
          typeof initial === "function"
            ? (initial as () => unknown)()
            : initial;
      return [
        slots[position],
        (value: any) => {
          const next =
            typeof value === "function" ? value(slots[position]) : value;
          if (!Object.is(next, slots[position])) {
            slots[position] = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial: unknown) {
      const position = index++;
      if (!(position in slots)) slots[position] = { current: initial };
      return slots[position];
    },
    useCallback(fn: unknown) {
      index++;
      return fn;
    },
    useEffect(effect: () => (() => void) | void, dependencies: unknown[]) {
      const position = index++,
        previous = slots[position];
      if (
        !previous ||
        dependencies.some(
          (value, i) => !Object.is(value, previous.dependencies[i]),
        )
      ) {
        slots[position] = { dependencies };
        pending.push(() => {
          previous?.cleanup?.();
          slots[position].cleanup = effect();
        });
      }
    },
  };
  return {
    react,
    setComponent(value: () => Element) {
      component = value;
    },
    render() {
      index = 0;
      dirty = false;
      result = component();
      while (pending.length) pending.shift()!();
      return result;
    },
    async flush() {
      for (let i = 0; i < 12; i++) {
        if (dirty) this.render();
        await Promise.resolve();
      }
      return result;
    },
    change() {
      dirty = true;
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
    },
    get result() {
      return result;
    },
  };
}
const jsx = {
  jsx: (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props,
    key,
  }),
  jsxs: (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props,
    key,
  }),
};
function load<T>(
  file: string,
  mocks: Record<string, unknown>,
  globals: Record<string, unknown> = {},
): T {
  const loadedModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    source,
    {
      module: loadedModule,
      exports: loadedModule.exports,
      require: (name: string) => mocks[name] ?? nodeRequire(name),
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://isolated.test",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "isolated",
        },
      },
      AbortController,
      Date,
      queueMicrotask,
      window: { dispatchEvent() {} },
      CustomEvent: class {
        constructor(
          public type: string,
          public detail: unknown,
        ) {}
      },
      localStorage: { getItem: () => "[]", setItem() {} },
      fetch() {
        throw Error("External requests forbidden");
      },
      ...globals,
    },
    { filename: file },
  );
  return loadedModule.exports as T;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function descendants(element: any): Element[] {
  if (!element || typeof element !== "object") return [];
  return [
    element,
    ...Object.values(element.props ?? {}).flatMap((value) =>
      Array.isArray(value) ? value.flatMap(descendants) : descendants(value),
    ),
  ];
}

test("customer headers reject a late account switch and guest-to-account switch before a private action", async () => {
  let current = authFor(),
    nextSession = deferred<{ data: { session: Auth["session"] } }>();
  const clientModule = load<{
    customerHeaders: (owner?: string | null) => Promise<Record<string, string>>;
  }>("apps/customer/context/CustomerFeatures.tsx", {
    react: hooks().react,
    "react/jsx-runtime": jsx,
    "@cafeos/shared/hooks/useAuth": { useAuth: () => current },
    "@cafeos/shared/supabase/client": {
      supabase: { auth: { getSession: () => nextSession.promise } },
    },
  });
  const pending = clientModule.customerHeaders(accountA.id);
  current = authFor(accountB);
  nextSession.resolve({ data: { session: current.session } });
  await assert.rejects(pending, /account changed/);
  await assert.rejects(clientModule.customerHeaders(null), /account changed/);
  assert.equal(
    (await clientModule.customerHeaders(accountB.id)).Authorization,
    "Bearer token-account-b",
  );
  nextSession = deferred();
  const guest = clientModule.customerHeaders(null);
  nextSession.resolve({ data: { session: null } });
  assert.equal((await guest).Authorization, undefined);
});

for (const fails of [false, true])
  test(`late favorite ${fails ? "failure" : "success"} never replaces the next account's favorites or error`, async () => {
    const lifecycle = hooks();
    let current = authFor();
    const delayed = deferred<{ ok: boolean; json: () => Promise<unknown> }>(),
      calls: { method: string; authorization: string }[] = [];
    const clientModule = load<{
      CustomerFeaturesProvider: (props: { children: unknown }) => Element;
    }>(
      "apps/customer/context/CustomerFeatures.tsx",
      {
        react: lifecycle.react,
        "react/jsx-runtime": jsx,
        "@cafeos/shared/hooks/useAuth": { useAuth: () => current },
        "@cafeos/shared/supabase/client": {
          supabase: {
            auth: {
              getSession: async () => ({ data: { session: current.session } }),
            },
          },
        },
      },
      {
        fetch: async (_url: string, init: RequestInit) => {
          const method = init.method ?? "GET",
            authorization = (init.headers as Record<string, string>)
              .Authorization;
          calls.push({ method, authorization });
          if (method === "POST") return delayed.promise;
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  menu_item_id:
                    current.user!.id === accountA.id
                      ? "a-favorite"
                      : "b-favorite",
                  configuration: [],
                },
              ],
            }),
          };
        },
      },
    );
    lifecycle.setComponent(() =>
      clientModule.CustomerFeaturesProvider({ children: null }),
    );
    await lifecycle.flush();
    const first = lifecycle.result.props.value;
    assert.equal(first.items[0].menu_item_id, "a-favorite");
    const write = first.toggle({ id: "added-by-a" });
    assert.equal(
      calls.find((call) => call.method === "POST")?.authorization,
      "Bearer token-account-a",
    );
    current = authFor(accountB);
    lifecycle.change();
    await lifecycle.flush();
    assert.equal(
      lifecycle.result.props.value.items[0].menu_item_id,
      "b-favorite",
    );
    delayed.resolve({
      ok: !fails,
      json: async () => ({ error: "Account A save failed" }),
    });
    await write;
    await lifecycle.flush();
    assert.equal(lifecycle.result.props.value.items.length, 1);
    assert.equal(
      lifecycle.result.props.value.items[0].menu_item_id,
      "b-favorite",
    );
    assert.equal(lifecycle.result.props.value.error, "");
    assert.equal(lifecycle.result.props.value.loading, false);
    lifecycle.unmount();
  });

function profileModule(
  lifecycle: ReturnType<typeof hooks>,
  auth: () => Auth,
  client: (options: any) => any,
) {
  return load<{ default: () => Element }>(
    "apps/customer/app/(shop)/profile/edit/page.tsx",
    {
      react: lifecycle.react,
      "react/jsx-runtime": jsx,
      "next/link": "link",
      "next/navigation": { useRouter: () => ({ replace() {} }) },
      "@cafeos/shared/hooks/useAuth": { useAuth: auth },
      "@supabase/supabase-js": {
        createClient: (_url: string, _key: string, options: any) =>
          client(options),
      },
      "../../../../components/PasswordInput": "password-input",
      "../../../../components/AppShell": {
        __esModule: true,
        default: "shell",
        InlineNotice: "notice",
      },
      "../../../../utils/authMessages": {
        getCustomerAuthErrorMessage: (message: string) => message,
      },
    },
  );
}

test("profile fields and passwords remount for another account while a failed save retains the current account's entry", async () => {
  let current = authFor();
  const lifecycle = hooks();
  const headers: string[] = [];
  const clientModule = profileModule(
    lifecycle,
    () => current,
    (options) => {
      headers.push(options.global.headers.Authorization);
      const query = {
        update() {
          return query;
        },
        eq() {
          return query;
        },
        abortSignal() {
          return Promise.resolve({ error: { message: "isolated failure" } });
        },
      };
      return { from: () => query };
    },
  );
  const firstBoundary = clientModule.default();
  assert.equal(firstBoundary.key, accountA.id);
  lifecycle.setComponent(firstBoundary.type as () => Element);
  await lifecycle.flush();
  const name = () =>
    descendants(lifecycle.result).find(
      (element) => element.props.id === "profile-name",
    )!;
  name().props.onChange({ target: { value: "Unsaved account A" } });
  await lifecycle.flush();
  const forms = descendants(lifecycle.result).filter(
    (element) => element.type === "form",
  );
  await forms[0].props.onSubmit({ preventDefault() {} });
  await lifecycle.flush();
  assert.equal(name().props.value, "Unsaved account A");
  assert.deepEqual(headers, ["Bearer token-account-a"]);
  current = authFor(accountB);
  const nextBoundary = clientModule.default();
  assert.equal(nextBoundary.key, accountB.id);
  assert.notEqual(nextBoundary.key, firstBoundary.key);
  lifecycle.unmount();
  const fresh = hooks();
  const nextModule = profileModule(
    fresh,
    () => current,
    () => {
      throw Error("Unexpected mutation");
    },
  );
  const next = nextModule.default();
  fresh.setComponent(next.type as () => Element);
  await fresh.flush();
  assert.equal(
    descendants(fresh.result).find(
      (element) => element.props.id === "profile-name",
    )!.props.value,
    accountB.id,
  );
  assert.equal(
    descendants(fresh.result).find(
      (element) => element.props.id === "profile-current-password",
    )!.props.value,
    "",
  );
  fresh.unmount();
});

test("delayed current-password verification never changes global auth or completes a password change after account switch", async () => {
  let current = authFor();
  const lifecycle = hooks();
  const verify = deferred<{ error: null }>();
  let updates = 0,
    revoked = 0;
  const clientModule = profileModule(
    lifecycle,
    () => current,
    (options) => {
      assert.equal(options.auth.persistSession, false);
      assert.equal(options.auth.autoRefreshToken, false);
      assert.equal(options.auth.detectSessionInUrl, false);
      return {
        auth: {
          signInWithPassword: () => verify.promise,
          updateUser: async () => {
            updates++;
            return { error: null };
          },
          signOut: async ({ scope }: { scope: string }) => {
            assert.equal(scope, "local");
            revoked++;
            return { error: null };
          },
        },
      };
    },
  );
  const boundary = clientModule.default();
  lifecycle.setComponent(boundary.type as () => Element);
  await lifecycle.flush();
  for (const [id, value] of [
    ["profile-current-password", "old-password"],
    ["profile-new-password", "new-password"],
    ["profile-confirm-password", "new-password"],
  ])
    descendants(lifecycle.result)
      .find((element) => element.props.id === id)!
      .props.onChange({ target: { value } });
  await lifecycle.flush();
  const submit = descendants(lifecycle.result)
    .filter((element) => element.type === "form")[1]
    .props.onSubmit({ preventDefault() {} });
  current = authFor(accountB);
  lifecycle.unmount();
  verify.resolve({ error: null });
  await submit;
  assert.equal(updates, 0);
  assert.equal(revoked, 1);
});
