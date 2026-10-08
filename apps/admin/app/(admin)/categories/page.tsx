// apps/admin/app/(admin)/categories/page.tsx
// Category management

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type { Category } from "@cafeos/shared/types";
type ManagedCategory = Category & { status?: "active" | "archived" };
import { Pagination } from "../../../components/Pagination";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import { Feedback } from "../../../components/Operations";

export default function CategoriesPage() {
  const confirmAction = useActionConfirm();
  const [actionError, setActionError] = useState("");
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [loading, setLoading] = useState(true);
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
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (!error) {
      setCategories((data as Category[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchCategories);
  }, [fetchCategories]);

  const handleAdd = async () => {
    if (!newName.trim()) return;

    // Duplicate Check
    const { count } = await supabase
      .from("categories")
      .select("*", { count: "exact", head: true })
      .ilike("name", newName.trim());

    if (count && count > 0) {
      alert(`A category named "${newName.trim()}" already exists.`);
      return;
    }

    const { error } = await supabase.from("categories").insert({
      name: newName.trim(),
      description: newDescription.trim() || null,
      sort_order: categories.length + 1,
    });

    if (error) {
      alert("Failed to add category");
      return;
    }

    setNewName("");
    setNewDescription("");
    fetchCategories();
  };

  const handleUpdate = async (id: string) => {
    // Duplicate Check
    const { count } = await supabase
      .from("categories")
      .select("*", { count: "exact", head: true })
      .ilike("name", editName.trim())
      .neq("id", id);

    if (count && count > 0) {
      alert(`A category named "${editName.trim()}" already exists.`);
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
      alert("Failed to update category");
      return;
    }

    setEditingId(null);
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
      <Feedback error={actionError} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            showArchived
              ? "bg-amber-100 text-amber-700 border border-amber-200"
              : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
          }`}
        >
          {showArchived ? "✓ Showing Archived" : "Show Archived"}
        </button>
      </div>

      {/* Add Category */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Add Category</h2>
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
          />
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl shadow-lg shadow-amber-200 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Categories List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 mx-auto border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-gray-50 flex flex-col h-full">
            <div className="flex-1">
              {paginatedCategories.map((cat) => {
                const isArchived = cat.status === "archived";
                return (
                  <div
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat)}
                    className={`px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer ${isArchived ? "opacity-50" : ""}`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {cat.name}{" "}
                        {isArchived && (
                          <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-600 uppercase tracking-wider">
                            Archived
                          </span>
                        )}
                      </p>
                      {cat.description && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {cat.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          cat.is_active
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {cat.is_active ? "Active" : "Inactive"}
                      </span>
                      <span className="text-gray-400">›</span>
                    </div>
                  </div>
                );
              })}

              {categories.length === 0 && (
                <div className="p-8 text-center text-gray-400">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-900">Category Options</h3>
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {editingId === selectedCategory.id ? (
                <div className="space-y-4 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <label className="block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-amber-500"
                  />
                  <label className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(selectedCategory.id)}
                      className="flex-1 bg-amber-500 text-white font-medium py-2 rounded-lg text-sm"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    {selectedCategory.name}
                  </h2>
                  <p className="text-sm text-gray-500 mb-4">
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
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${selectedCategory.is_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >
                      {selectedCategory.is_active
                        ? "✓ Active"
                        : "Enable Category"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(selectedCategory.id);
                        setEditName(selectedCategory.name);
                        setEditDescription(selectedCategory.description || "");
                      }}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-medium"
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
                          ? "bg-green-50 text-green-600 hover:bg-green-100"
                          : "bg-red-50 text-red-600 hover:bg-red-100"
                      }`}
                    >
                      {selectedCategory.status === "archived"
                        ? "Restore"
                        : "Archive"}
                    </button>
                    <button
                      onClick={() => handleDelete(selectedCategory.id)}
                      className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium ml-auto"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              <hr className="border-gray-100 mb-4" />
              <h4 className="font-semibold text-gray-900 mb-3">
                Linked Menu Items
              </h4>

              {loadingItems ? (
                <div className="py-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin"></div>
                </div>
              ) : connectedItems.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  No items connected to this category.
                </p>
              ) : (
                <div className="space-y-2">
                  {connectedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white shadow-sm"
                    >
                      <span className="text-sm font-medium text-gray-900">
                        {item.name}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${item.is_available ? "bg-green-500" : "bg-red-500"}`}
                      ></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
