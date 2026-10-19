// apps/admin/app/(admin)/categories/page.tsx
// Category management

"use client";
import { Icon } from "../../../components/Operations";

import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type { Category } from "@cafeos/shared/types";
type ManagedCategory = Category & { status?: "active" | "archived" };
import { Pagination } from "../../../components/Pagination";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import { Feedback, LoadingRows, PageHeader } from "../../../components/Operations";
import { TableSkeleton } from "../../../components/AdminSkeletons";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { AdminDialog } from "../../../components/AdminDialog";
import { notifyAdmin } from "../../../components/AdminToasts";

export default function CategoriesPage() {
  const confirmAction = useActionConfirm();
  const [actionError, setActionError] = useState("");
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Modal State
  const [selectedCategory, setSelectedCategory] =
    useState<ManagedCategory | null>(null);
  const [connectedItems, setConnectedItems] = useState<
    { id: string; name: string; is_available: boolean }[]
  >([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await withRequestDeadline((signal) =>
        supabase
          .from("categories")
          .select("*")
          .order("sort_order", { ascending: true })
          .abortSignal(signal),
      );
      if (error) throw Error("Categories could not load. Please try again.");
      setCategories((data as Category[]) || []);
      setLoadError("");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Categories could not load. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchCategories);
  }, [fetchCategories]);

  const handleAdd = async () => {
    if (!newName.trim()) {
      notifyAdmin("Enter a category name.", "error");
      return;
    }

    // Duplicate Check
    const { count } = await supabase
      .from("categories")
      .select("*", { count: "exact", head: true })
      .ilike("name", newName.trim());

    if (count && count > 0) {
      notifyAdmin(
        `A category named "${newName.trim()}" already exists.`,
        "error",
      );
      return;
    }

    const { error } = await supabase.from("categories").insert({
      name: newName.trim(),
      description: newDescription.trim() || null,
      sort_order: categories.length + 1,
    });

    if (error) {
      notifyAdmin(
        "Failed to add category. Your entries are retained.",
        "error",
      );
      return;
    }

    setNewName("");
    setNewDescription("");
    notifyAdmin("Category added.", "success");
    fetchCategories();
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) {
      notifyAdmin("Enter a category name.", "error");
      return;
    }
    // Duplicate Check
    const { count } = await supabase
      .from("categories")
      .select("*", { count: "exact", head: true })
      .ilike("name", editName.trim())
      .neq("id", id);

    if (count && count > 0) {
      notifyAdmin(
        `A category named "${editName.trim()}" already exists.`,
        "error",
      );
      return;
    }

    const { error } = await supabase
      .from("categories")
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
      })
      .eq("id", id);

    if (error) {
      notifyAdmin(
        "Failed to update category. Your entries are retained.",
        "error",
      );
      return;
    }

    setEditingId(null);
    notifyAdmin("Category updated.", "success");
    if (selectedCategory)
      setSelectedCategory({
        ...selectedCategory,
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
    fetchCategories();
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmAction({
        title: "Delete this category?",
        description:
          "Its products will stay in the menu without a category. The category itself will be permanently removed.",
        details: [categories.find((c) => c.id === id)?.name || "Category"],
        confirmLabel: "Delete category",
        danger: true,
      }))
    )
      return;

    const { error } = await supabase.from("categories").delete().eq("id", id);

    if (error) {
      setActionError("Could not delete category. " + error.message);
      return;
    }

    notifyAdmin("Category deleted.", "success");
    setSelectedCategory(null);
    fetchCategories();
  };

  const handleArchive = async (id: string, currentStatus?: string) => {
    const newStatus = currentStatus === "archived" ? "active" : "archived";

    if (
      !(await confirmAction({
        title:
          newStatus === "archived"
            ? "Archive this category and its products?"
            : "Restore this category?",
        description:
          newStatus === "archived"
            ? "This hides the category and archives all products in it. Check the connected products before continuing."
            : "This restores the category. Restore its products individually from Menu & prices if you want them available again.",
        details: [categories.find((c) => c.id === id)?.name || "Category"],
        confirmLabel:
          newStatus === "archived"
            ? "Archive category & products"
            : "Restore category",
        danger: newStatus === "archived",
      }))
    )
      return;

    // Archive menu items first if archiving
    if (newStatus === "archived") {
      const { error: productError } = await supabase
        .from("menu_items")
        .update({ status: "archived" })
        .eq("category_id", id);
      if (productError) {
        setActionError(
          "Could not archive the products. " + productError.message,
        );
        return;
      }
    }

    const { error } = await supabase
      .from("categories")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      setActionError(
        `Could not ${newStatus === "archived" ? "archive" : "restore"} the category. ${newStatus === "archived" ? "Its products were archived; retry to finish the category update. " : ""}` +
          error.message,
      );
      return;
    }

    notifyAdmin(
      newStatus === "archived"
        ? "Category and its products archived."
        : "Category restored.",
      newStatus === "archived" ? "info" : "success",
    );
    if (selectedCategory) {
      setSelectedCategory({
        ...selectedCategory,
        status: newStatus,
      } as Category);
    }
    fetchCategories();
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    if (
      !(await confirmAction({
        title: isActive ? "Hide this category?" : "Show this category?",
        description:
          "This changes category visibility. It does not delete the category or change its product records.",
        details: [categories.find((c) => c.id === id)?.name || "Category"],
        confirmLabel: isActive ? "Hide category" : "Show category",
      }))
    )
      return;
    const { error } = await supabase
      .from("categories")
      .update({ is_active: !isActive })
      .eq("id", id);
    if (error) {
      setActionError("Could not change category visibility. " + error.message);
      return;
    }
    notifyAdmin(
      isActive ? "Category hidden from the menu." : "Category is visible again.",
      isActive ? "info" : "success",
    );
    if (selectedCategory)
      setSelectedCategory({ ...selectedCategory, is_active: !isActive });
    fetchCategories();
  };

  const handleCategoryClick = async (cat: Category) => {
    setSelectedCategory(cat);
    setLoadingItems(true);
    setEditingId(null); // Reset edit state if open
    const { data } = await supabase
      .from("menu_items")
      .select("id, name, is_available")
      .eq("category_id", cat.id)
      .order("name");
    setConnectedItems(data || []);
    setLoadingItems(false);
  };

  const filteredCategories = categories.filter((c) =>
    showArchived ? true : c.status !== "archived",
  );
  const totalItems = filteredCategories.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedCategories = filteredCategories.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // If we delete the last item on a page, drop to previous page natively
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      void Promise.resolve().then(() => setCurrentPage(totalPages));
    }
  }, [totalPages, currentPage]);

  return (
    <div>
      <Feedback error={actionError || loadError} />
      {loadError && (
        <button
          className="ops-button"
          disabled={loading}
          onClick={() => void fetchCategories()}
        >
          Retry categories
        </button>
      )}
      <PageHeader eyebrow="MENU ORGANIZATION" title="Categories" description="Organize the menu so customers can find their favourites.">
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            showArchived
              ? "bg-warning-soft text-warning border border-warning-border"
              : "bg-raised text-muted border border-subtle hover:bg-raised"
          }`}
        >
          {showArchived ? "Showing archived" : "Show Archived"}
        </button>
      </PageHeader>

      {/* Add Category */}
      <div className="bg-surface rounded-2xl shadow-sm border border-subtle p-6 mb-6">
        <h2 className="font-semibold text-ink mb-4">Add Category</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm">
            Category name
            <FieldRequirement required={true} />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              className="mt-1 block w-full px-4 py-2.5 rounded-xl border border-subtle bg-raised text-ink text-sm placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-warning-border transition-all"
            />
          </label>
          <label className="block min-w-0 flex-1 text-sm">
            Description
            <FieldRequirement required={false} />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="mt-1 block w-full px-4 py-2.5 rounded-xl border border-subtle bg-raised text-ink text-sm placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-warning-border transition-all"
            />
          </label>
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-action to-action text-on-action font-semibold rounded-xl shadow-lg shadow-none hover:scale-[1.02] active:scale-[0.98] transition-all text-sm disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Categories List */}
      <div className="bg-surface rounded-2xl shadow-sm border border-subtle overflow-hidden">
        {loading ? (
          <LoadingRows label="Loading categories…" />
        ) : (
          <div className="divide-y divide-subtle flex flex-col h-full">
            <div className="flex-1">
              {paginatedCategories.map((cat) => {
                const isArchived = cat.status === "archived";
                return (
                  <div
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat)}
                    role="button" tabIndex={0} aria-label={`Open ${cat.name}`}
                    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleCategoryClick(cat); } }}
                    className={`px-6 py-4 flex items-center justify-between hover:bg-raised transition-colors cursor-pointer ${isArchived ? "opacity-50" : ""}`}
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {cat.name}{" "}
                        {isArchived && (
                          <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-raised text-muted uppercase tracking-wider">
                            Archived
                          </span>
                        )}
                      </p>
                      {cat.description && (
                        <p className="text-xs text-muted mt-0.5">
                          {cat.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          cat.is_active
                            ? "bg-success-soft text-success"
                            : "bg-raised text-muted"
                        }`}
                      >
                        {cat.is_active ? "Active" : "Inactive"}
                      </span>
                      <span className="text-muted">›</span>
                    </div>
                  </div>
                );
              })}

              {categories.length === 0 && (
                <div className="p-8 text-center text-muted">
                  No categories yet.
                </div>
              )}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedCategory && (
        <AdminDialog
          title="Category Options"
          onClose={() => setSelectedCategory(null)}
          className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        >
          <div className="px-6 py-4 border-b border-subtle flex items-center justify-between bg-raised">
            <h3 className="font-bold text-ink">Category Options</h3>
            <button
              aria-label="Close dialog"
              onClick={() => setSelectedCategory(null)}
              className="text-muted hover:text-muted"
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[70vh]">
            {editingId === selectedCategory.id ? (
              <div className="space-y-4 mb-6 bg-raised p-4 rounded-xl border border-subtle">
                <label className="block text-sm font-medium text-ink">
                  Name
                  <FieldRequirement required={true} />
                </label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-subtle bg-surface text-sm focus:ring-2 focus:ring-accent"
                />
                <label className="block text-sm font-medium text-ink">
                  Description
                  <FieldRequirement required={false} />
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 rounded-xl border border-subtle bg-surface text-sm focus:ring-2 focus:ring-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(selectedCategory.id)}
                    className="flex-1 bg-warning text-on-action font-medium py-2 rounded-lg text-sm"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex-1 bg-raised text-ink font-medium py-2 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <h2 className="text-xl font-bold text-ink mb-1">
                  {selectedCategory.name}
                </h2>
                <p className="text-sm text-muted mb-4">
                  {selectedCategory.description || "No description provided."}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      handleToggleActive(
                        selectedCategory.id,
                        selectedCategory.is_active,
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${selectedCategory.is_active ? "bg-success-soft text-success hover:bg-success-soft" : "bg-raised text-muted hover:bg-raised"}`}
                  >
                    {selectedCategory.is_active
                      ? "Active"
                      : "Enable Category"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(selectedCategory.id);
                      setEditName(selectedCategory.name);
                      setEditDescription(selectedCategory.description || "");
                    }}
                    className="px-3 py-1.5 bg-info-soft text-info hover:bg-info-soft rounded-lg text-sm font-medium"
                  >
                    Edit Info
                  </button>
                  <button
                    onClick={() =>
                      handleArchive(
                        selectedCategory.id,
                        selectedCategory.status,
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      selectedCategory.status === "archived"
                        ? "bg-success-soft text-success hover:bg-success-soft"
                        : "bg-danger-soft text-danger hover:bg-danger-soft"
                    }`}
                  >
                    {selectedCategory.status === "archived"
                      ? "Restore"
                      : "Archive"}
                  </button>
                  <button
                    onClick={() => handleDelete(selectedCategory.id)}
                    className="px-3 py-1.5 bg-danger-soft text-danger hover:bg-danger-soft rounded-lg text-sm font-medium ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            <hr className="border-subtle mb-4" />
            <h4 className="font-semibold text-ink mb-3">
              Linked Menu Items
            </h4>

            {loadingItems ? (
              <TableSkeleton
                label="Loading linked menu items…"
                header={false}
                rows={4}
                columns={["media", "title", "badge"]}
              />
            ) : connectedItems.length === 0 ? (
              <p className="text-sm text-muted text-center py-6 bg-raised rounded-xl border border-dashed border-subtle">
                No items connected to this category.
              </p>
            ) : (
              <div className="space-y-2">
                {connectedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-subtle bg-surface shadow-sm"
                  >
                    <span className="text-sm font-medium text-ink">
                      {item.name}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${item.is_available ? "bg-success" : "bg-danger"}`}
                    ></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AdminDialog>
      )}
    </div>
  );
}
