"use client";

import { useState, useTransition } from "react";
import { AllowanceItemStatus, ContractStatus } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { formatCurrency, formatDate } from "@/lib/utils";
import { STANDARD_ALLOWANCE_CATEGORIES } from "@/lib/contracts/contracts";
import {
  addAllowanceItemAction,
  updateAllowanceItemAction,
  deleteAllowanceItemAction,
  applySoaRecommendationAction,
} from "@/lib/sales/soa-actions";
import { SoaRecommendation } from "@/lib/contracts/soa-recommendations";
import {
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Check,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  Lock,
  DollarSign,
  Tag,
  CheckCircle,
  X,
} from "lucide-react";

type ItemData = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  location: string | null;
  quantity: number | null;
  unit: string | null;
  amount: number;
  actualCost: number | null;
  status: AllowanceItemStatus;
  costCode: string | null;
  selectionRequired: boolean;
  selectionDueDate: Date | null;
  displayToClient: boolean;
  notes: string | null;
};

type SoaData = {
  id: string;
  soaNumber: string;
  version: number;
  status: string;
  totalAllowance: number;
  committedAmount: number;
  remainingAmount: number;
  overageAmount: number;
  contractId: string;
  contractStatus?: ContractStatus;
};

type Props = {
  soa: SoaData;
  items: ItemData[];
  recommendations: SoaRecommendation[];
};

export function SoaEditor({ soa, items, recommendations }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ItemData | null>(null);

  const isLocked = soa.status === "LOCKED" || soa.contractStatus === ContractStatus.EXECUTED;

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesCategory = selectedCategory === "ALL" || item.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Unique categories in current items
  const activeCategories = Array.from(new Set(items.map((i) => i.category))).sort();

  // Group items by category
  const groupedByCategory = filteredItems.reduce<Record<string, ItemData[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const handleApplyRec = (rec: SoaRecommendation) => {
    const form = new FormData();
    if (rec.type === "CATEGORY_SUGGESTION" && rec.itemId && rec.suggestedValue) {
      form.set("actionType", "CATEGORY_SUGGESTION");
      form.set("itemId", rec.itemId);
      form.set("suggestedValue", String(rec.suggestedValue));
    } else if (rec.type === "SANITY_CHECK" && rec.suggestedValue) {
      form.set("actionType", "ADD_ESSENTIAL");
      form.set("suggestedValue", String(rec.suggestedValue));
    } else {
      return;
    }

    startTransition(async () => {
      await applySoaRecommendationAction(soa.id, form);
    });
  };

  const handleDeleteItem = (itemId: string, itemName: string) => {
    if (!window.confirm(`Delete allowance item "${itemName}"?`)) return;
    startTransition(async () => {
      await deleteAllowanceItemAction(itemId);
    });
  };

  return (
    <div className="space-y-6">
      {/* AI Recommendations Banner */}
      {recommendations.length > 0 && !isLocked ? (
        <Card className="border-l-4 border-l-purple-500 bg-purple-50/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <h3 className="font-semibold text-sb-ink text-sm">
              AI Allowance Review & Sanity Recommendations ({recommendations.length})
            </h3>
          </div>
          <div className="space-y-2">
            {recommendations.slice(0, 4).map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-purple-100 text-xs shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  {rec.severity === "WARNING" ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  ) : (
                    <Info className="h-4 w-4 text-purple-500 shrink-0" />
                  )}
                  <span className="text-sb-ink">{rec.message}</span>
                </div>
                {rec.suggestedValue && (rec.type === "CATEGORY_SUGGESTION" || rec.type === "SANITY_CHECK") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-purple-700 border-purple-200 hover:bg-purple-50 shrink-0"
                    onClick={() => handleApplyRec(rec)}
                    disabled={isPending}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    {rec.type === "SANITY_CHECK" ? `Add ${rec.suggestedValue}` : "Apply Category"}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Filter and Add Item Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedCategory("ALL")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedCategory === "ALL"
                ? "bg-sb-ink text-white"
                : "bg-white text-sb-muted border border-sb-border hover:text-sb-ink"
            }`}
          >
            All Categories ({items.length})
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedCategory === cat
                  ? "bg-sb-ink text-white"
                  : "bg-white text-sb-muted border border-sb-border hover:text-sb-ink"
              }`}
            >
              {cat} ({items.filter((i) => i.category === cat).length})
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input
            placeholder="Filter allowances…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-xs w-full sm:w-48"
          />
          {!isLocked ? (
            <Button
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              className="h-9 px-3 text-xs shrink-0 bg-sb-orange hover:bg-sb-orange-dark text-white font-semibold"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Allowance Item
            </Button>
          ) : null}
        </div>
      </div>

      {/* Grouped Allowance Items */}
      {Object.keys(groupedByCategory).length === 0 ? (
        <div className="rounded-xl border border-dashed border-sb-border bg-white p-12 text-center text-sb-muted text-sm">
          No allowance items found matching your criteria.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByCategory).map(([category, categoryItems]) => {
            const catTotal = categoryItems.reduce((acc, it) => acc + Number(it.amount), 0);
            return (
              <Card key={category} className="overflow-hidden p-0">
                <div className="flex items-center justify-between bg-[#F8FAFC] px-5 py-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-sb-orange" />
                    <h3 className="font-bold text-sb-ink text-sm">{category}</h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-sb-muted border border-sb-border">
                      {categoryItems.length} items
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] uppercase tracking-wider text-sb-muted font-medium mr-2">
                      Subtotal:
                    </span>
                    <span className="font-mono font-bold text-sb-ink text-sm">
                      {formatCurrency(catTotal)}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-sb-border">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sb-ink text-sm">{item.name}</span>
                          <StatusBadge tone={statusTone(item.status)}>
                            {item.status.replace(/_/g, " ")}
                          </StatusBadge>
                          {!item.displayToClient ? (
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Internal Only
                            </span>
                          ) : null}
                        </div>
                        {item.description ? (
                          <p className="text-xs text-sb-muted max-w-xl">{item.description}</p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-sb-muted pt-0.5">
                          {item.location ? <span>Location: {item.location}</span> : null}
                          {item.quantity ? (
                            <span>
                              Qty: {item.quantity} {item.unit || ""}
                            </span>
                          ) : null}
                          {item.selectionDueDate ? (
                            <span className="flex items-center gap-1 text-sb-ink font-medium">
                              <Calendar className="h-3 w-3 text-sb-muted" />
                              Due: {formatDate(item.selectionDueDate)}
                            </span>
                          ) : null}
                          {item.costCode ? <span>Cost Code: {item.costCode}</span> : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="text-right">
                          <span className="font-mono font-bold text-sb-ink text-base block">
                            {formatCurrency(item.amount)}
                          </span>
                          {item.actualCost !== null ? (
                            <span className="text-xs font-mono text-sb-muted">
                              Actual: {formatCurrency(item.actualCost)}
                            </span>
                          ) : null}
                        </div>

                        {!isLocked ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setEditingItem(item)}
                              title="Edit item"
                            >
                              <Edit2 className="h-3.5 w-3.5 text-sb-muted" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 text-sb-red hover:bg-red-50 hover:border-red-200"
                              onClick={() => handleDeleteItem(item.id, item.name)}
                              title="Delete item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Lock className="h-4 w-4 text-sb-muted" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Allowance Item Modal */}
      {isAddModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-w-lg w-full bg-white rounded-2xl p-6 shadow-2xl border border-sb-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-sb-border pb-3 mb-4">
              <h3 className="font-bold text-sb-ink text-base">Add Allowance Item</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-sb-muted hover:text-sb-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              action={async (formData) => {
                await addAllowanceItemAction(soa.id, formData);
                setIsAddModalOpen(false);
              }}
              className="space-y-4"
            >
              <FormField label="Category" required>
                <select
                  name="category"
                  defaultValue={selectedCategory !== "ALL" ? selectedCategory : "Flooring"}
                  className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm text-sb-text"
                  required
                >
                  {STANDARD_ALLOWANCE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Item Name" required>
                <Input name="name" placeholder="e.g. Hardwood & Engineered Tile" required />
              </FormField>

              <FormField label="Allowance Amount ($ CAD)" required>
                <Input name="amount" type="number" step="0.01" min="0" placeholder="12500.00" required />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Quantity (Optional)">
                  <Input name="quantity" type="number" step="0.1" placeholder="1" />
                </FormField>
                <FormField label="Unit (Optional)">
                  <Input name="unit" placeholder="sq ft, fixtures, pcs" />
                </FormField>
              </div>

              <FormField label="Room / Location (Optional)">
                <Input name="location" placeholder="e.g. Main floor & Primary Ensuite" />
              </FormField>

              <FormField label="Selection Due Date (Optional)">
                <Input name="selectionDueDate" type="date" />
              </FormField>

              <FormField label="Specification Description">
                <Textarea
                  name="description"
                  placeholder="Specific quality tier, allowances for material vs install, supplier instructions..."
                  rows={3}
                />
              </FormField>

              <div className="flex items-center justify-between border-t border-sb-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-sb-orange hover:bg-sb-orange-dark text-white font-semibold">
                  Add Item & Update SOA
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Allowance Item Modal */}
      {editingItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-w-lg w-full bg-white rounded-2xl p-6 shadow-2xl border border-sb-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-sb-border pb-3 mb-4">
              <h3 className="font-bold text-sb-ink text-base">Edit Allowance Item</h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-sb-muted hover:text-sb-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              action={async (formData) => {
                await updateAllowanceItemAction(editingItem.id, formData);
                setEditingItem(null);
              }}
              className="space-y-4"
            >
              <FormField label="Category" required>
                <select
                  name="category"
                  defaultValue={editingItem.category}
                  className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm text-sb-text"
                  required
                >
                  {STANDARD_ALLOWANCE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Item Name" required>
                <Input name="name" defaultValue={editingItem.name} required />
              </FormField>

              <FormField label="Allowance Amount ($ CAD)" required>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editingItem.amount}
                  required
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Quantity">
                  <Input
                    name="quantity"
                    type="number"
                    step="0.1"
                    defaultValue={editingItem.quantity ?? ""}
                  />
                </FormField>
                <FormField label="Unit">
                  <Input name="unit" defaultValue={editingItem.unit ?? ""} />
                </FormField>
              </div>

              <FormField label="Room / Location">
                <Input name="location" defaultValue={editingItem.location ?? ""} />
              </FormField>

              <FormField label="Selection Due Date">
                <Input
                  name="selectionDueDate"
                  type="date"
                  defaultValue={
                    editingItem.selectionDueDate
                      ? new Date(editingItem.selectionDueDate).toISOString().slice(0, 10)
                      : ""
                  }
                />
              </FormField>

              <FormField label="Specification Description">
                <Textarea
                  name="description"
                  defaultValue={editingItem.description ?? ""}
                  rows={3}
                />
              </FormField>

              <div className="flex items-center justify-between border-t border-sb-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingItem(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-sb-orange hover:bg-sb-orange-dark text-white font-semibold">
                  Save Allowance Item
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
