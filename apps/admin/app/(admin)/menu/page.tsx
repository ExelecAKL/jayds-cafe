"use client";
import { useState } from "react";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import { supabase } from "@cafeos/shared/supabase/client";
import type { MenuItem } from "@cafeos/shared/types";
import { menuProductImageUrl } from "@cafeos/shared/utils/product-images";
import { MenuItemForm } from "../../../components/MenuItemForm";
import {
  PageHeader,
  Badge,
  Drawer,
  Feedback,
  Icon,
  peso,
  LoadingRows,
  Empty,
} from "../../../components/Operations";
import { PaginatedTable } from "../../../components/PaginatedTable";
export default function CatalogPage() {
  const {
    menuItems,
    categories,
    loading,
    refetch,
    error: catalogError,
  } = useMenu({
    includeUnavailable: true,
  });
  const [edit, setEdit] = useState<MenuItem | null | undefined>();
  const [archive, setArchive] = useState<MenuItem | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const rows = menuItems.filter(
    (m) =>
      (m.name + m.category?.name)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "archived" && m.status === "archived") ||
        (filter === "active" && m.status === "active") ||
        (filter === "disabled" && !m.is_available)),
  );
  const postArchive = async () => {
    if (!archive) return;
    setBusy(true);
    setError("");
    const { error } = await supabase
      .from("menu_items")
      .update({ status: archive.status === "archived" ? "active" : "archived" })
      .eq("id", archive.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setArchive(null);
    setSuccess("Catalog publication updated.");
    refetch();
  };
  return (
    <>
      <PageHeader
        eyebrow="Shared ordering catalog"
        title="Menu products"
        description="Publish prices, customizations, and stock requirements to POS and mobile."
      >
        <button className="ops-button primary" onClick={() => setEdit(null)}>
          <Icon name="plus" />
          Add product
        </button>
      </PageHeader>
      <Feedback error={error || catalogError || ""} success={success} />
      {catalogError && (
        <button
          type="button"
          className="ops-button"
          disabled={loading}
          onClick={() => void refetch()}
        >
          Try loading menu again
        </button>
      )}
      <section className="ops-panel">
        <div className="ops-toolbar">
          <input
            type="search"
            aria-label="Search menu products"
            placeholder="Search product or category…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />
          <select
            aria-label="Publication filter"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          >
            <option value="all">All products</option>
            <option value="active">Published</option>
            <option value="disabled">Manually disabled</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        {loading ? (
          <LoadingRows label="Loading catalog…" />
        ) : (
          <div className="ops-table-wrap">
            <PaginatedTable
              aria-label="Menu products"
              resetKey={JSON.stringify([search, filter])}
              className="ops-table"
            >
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="numeric">Base price</th>
                  <th>Publication</th>
                  <th>Ordering</th>
                  <th>Options</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {menuProductImageUrl(m.id, m.image_url) && (
                          <img
                            src={menuProductImageUrl(m.id, m.image_url)!}
                            alt=""
                            width={48}
                            height={48}
                            loading="lazy"
                            className="h-12 w-12 shrink-0 rounded-lg bg-bg-elevated object-contain"
                          />
                        )}
                        <div>
                          <button
                            className="ops-text-button"
                            onClick={() => setEdit(m)}
                          >
                            {m.name}
                          </button>
                          <small>{m.tags?.join(" · ")}</small>
                        </div>
                      </div>
                    </td>
                    <td>{m.category?.name ?? "Uncategorized"}</td>
                    <td className="numeric">{peso(m.price)}</td>
                    <td>
                      <Badge
                        tone={m.status === "active" ? "success" : "neutral"}
                      >
                        {m.status === "active" ? "Published" : "Archived"}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={m.is_available ? "brand" : "warning"}>
                        {m.is_available
                          ? "Available"
                          : m.manually_available === false
                            ? "Manually disabled"
                            : m.status === "archived"
                              ? "Archived"
                              : "Unavailable"}
                      </Badge>
                    </td>
                    <td>{m.variants?.length ?? 0}</td>
                    <td>
                      <button
                        className="ops-button small"
                        onClick={() => setEdit(m)}
                      >
                        Edit
                      </button>
                      <button
                        className="ops-button small"
                        onClick={() => setArchive(m)}
                      >
                        {m.status === "archived" ? "Restore" : "Archive"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </PaginatedTable>
            {!rows.length && (
              <Empty
                title="No products found"
                description="Try another search or filter."
                icon="search"
              />
            )}
          </div>
        )}
      </section>
      {edit !== undefined && (
        <MenuItemForm
          item={edit}
          categories={categories}
          onClose={() => {
            setEdit(undefined);
            refetch();
          }}
        />
      )}
      {archive && (
        <Drawer
          title={
            archive.status === "archived"
              ? "Restore product"
              : "Archive product"
          }
          onClose={() => setArchive(null)}
          busy={busy}
        >
          <Feedback error={error} />
          <p>
            {archive.status === "archived"
              ? "Publish " +
                archive.name +
                " again? Ordering follows its manual availability and stock requirements."
              : "Archive " +
                archive.name +
                "? It will leave the ordering catalog. Historical orders remain available."}
          </p>
          <div className="ops-form-actions">
            <button
              className="ops-button"
              onClick={() => setArchive(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="ops-button primary"
              disabled={busy}
              onClick={() => void postArchive()}
            >
              {busy ? "Updating…" : "Confirm"}
            </button>
          </div>
        </Drawer>
      )}
    </>
  );
}
