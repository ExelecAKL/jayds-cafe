import { NextResponse } from "next/server";
import { coordinates } from "../../../lib/location";
import { getServerDb } from "../../../lib/server-access";
import { readCustomerBranch } from "../branch/lib";
const pending = new Map<string, Promise<unknown>>();
let lastRequest = 0;
export async function GET(req: Request) {
  const input = new URL(req.url),
    q = input.searchParams.get("q")?.trim(),
    lat = Number(input.searchParams.get("lat")),
    lng = Number(input.searchParams.get("lng"));
  const reverse =
    input.searchParams.has("lat") && input.searchParams.has("lng");
  if (
    (!reverse && (!q || q.length < 3 || q.length > 200)) ||
    (reverse && !coordinates(lat, lng))
  )
    return NextResponse.json(
      { error: "Enter an address or valid coordinates." },
      { status: 400 },
    );
  const url = new URL(
    reverse ? "/reverse" : "/api",
    process.env.PHOTON_BASE_URL || "https://photon.komoot.io",
  );
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "en");
  if (reverse) {
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
  } else {
    url.searchParams.set("q", q!);
    try {
      const branch = await readCustomerBranch(getServerDb());
      url.searchParams.set("lat", String(branch.latitude));
      url.searchParams.set("lon", String(branch.longitude));
    } catch {
      return NextResponse.json(
        {
          error:
            "Address search is unavailable. Place the pin and enter the address manually.",
          results: [],
        },
        { status: 503 },
      );
    }
  }
  const key = url.toString();
  if (!pending.has(key)) {
    if (Date.now() - lastRequest < 500)
      return NextResponse.json(
        { error: "Please pause briefly before searching again." },
        { status: 429, headers: { "Retry-After": "1" } },
      );
    lastRequest = Date.now();
    pending.set(
      key,
      fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { Accept: "application/json" },
        cache: "no-store",
      }).then(async (r) => {
        if (!r.ok) throw new Error("Search unavailable");
        return r.json();
      }),
    );
  }
  try {
    const data = (await pending.get(key)) as {
      features?: {
        geometry?: { coordinates: number[] };
        properties?: Record<string, string>;
      }[];
    };
    const results = (data.features ?? []).slice(0, 5).flatMap((f) => {
      const p = f.properties ?? {},
        point = coordinates(
          f.geometry?.coordinates?.[1],
          f.geometry?.coordinates?.[0],
        );
      if (
        !point ||
        (!reverse && p.countrycode && p.countrycode.toUpperCase() !== "PH")
      )
        return [];
      return [
        {
          ...point,
          address: [
            p.name,
            p.housenumber,
            p.street,
            p.district,
            p.city,
            p.state,
            p.country,
          ]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(", "),
        },
      ];
    });
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Address search is unavailable. Place the pin and enter the address manually.",
        results: [],
      },
      { status: 503 },
    );
  } finally {
    pending.delete(key);
  }
}
