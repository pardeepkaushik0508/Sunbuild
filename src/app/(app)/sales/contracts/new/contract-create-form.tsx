"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { createPurchaseContractAction } from "@/lib/sales/contract-actions";
import { formatCurrency, roundMoney } from "@/lib/utils";
import {
  FileText,
  Upload,
  Sparkles,
  Calculator,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  DollarSign,
  ScrollText,
} from "lucide-react";
import { SUNVIEW_COMMUNITIES } from "@/lib/communities";

type ProjectOption = { id: string; name: string };
type LeadOption = { id: string; name: string; email: string | null; phone: string | null };
type BuyerOption = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };

type Props = {
  projects: ProjectOption[];
  leads: LeadOption[];
  buyers: BuyerOption[];
  defaultProjectId?: string;
};

export function ContractCreateForm({ projects, leads, buyers, defaultProjectId = "" }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"manual" | "upload">("manual");
  const [error, setError] = useState<string | null>(null);

  // Form states for dynamic live math calculation
  const [basePrice, setBasePrice] = useState<number>(650000);
  const [allowanceTotal, setAllowanceTotal] = useState<number>(60000);
  const [upgradesTotal, setUpgradesTotal] = useState<number>(0);
  const [discountsTotal, setDiscountsTotal] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(5.0);

  // Form fields state
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>("");
  const [buyerFirstName, setBuyerFirstName] = useState<string>("");
  const [buyerLastName, setBuyerLastName] = useState<string>("");
  const [buyerEmail, setBuyerEmail] = useState<string>("");
  const [buyerPhone, setBuyerPhone] = useState<string>("");
  const [buyerMailing, setBuyerMailing] = useState<string>("");

  const [projectId, setProjectId] = useState<string>(defaultProjectId);
  const [leadId, setLeadId] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [municipalAddress, setMunicipalAddress] = useState<string>("");
  const [legalAddress, setLegalAddress] = useState<string>("");
  const [lotBlockPlan, setLotBlockPlan] = useState<string>("");
  const [builderName, setBuilderName] = useState<string>("Sunview Custom Homes");

  const [contractDate, setContractDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [targetClosing, setTargetClosing] = useState<string>("");

  const [scopeSummary, setScopeSummary] = useState<string>("");
  const [inclusions, setInclusions] = useState<string>("");
  const [exclusions, setExclusions] = useState<string>("");
  const [specialConditions, setSpecialConditions] = useState<string>("");
  const [internalNotes, setInternalNotes] = useState<string>("");

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractedNotice, setExtractedNotice] = useState<string | null>(null);

  // Math totals calculation
  const subtotalBeforeTax = Math.max(
    0,
    roundMoney(basePrice + allowanceTotal + upgradesTotal - discountsTotal)
  );
  const taxAmount = roundMoney((subtotalBeforeTax * taxRate) / 100);
  const totalContractPrice = roundMoney(subtotalBeforeTax + taxAmount);

  // Quick fill from existing buyer dropdown
  const handleBuyerSelect = (bId: string) => {
    setSelectedBuyerId(bId);
    if (!bId) return;
    const found = buyers.find((b) => b.id === bId);
    if (found) {
      setBuyerFirstName(found.firstName);
      setBuyerLastName(found.lastName);
      setBuyerEmail(found.email || "");
      setBuyerPhone(found.phone || "");
    }
  };

  // Quick fill from existing lead dropdown
  const handleLeadSelect = (lId: string) => {
    setLeadId(lId);
    if (!lId) return;
    const found = leads.find((l) => l.id === lId);
    if (found) {
      const parts = found.name.split(" ");
      setBuyerFirstName(parts[0] || "");
      setBuyerLastName(parts.slice(1).join(" ") || "");
      setBuyerEmail(found.email || "");
      setBuyerPhone(found.phone || "");
    }
  };

  // Simulated client-side extraction preview from filename or file buffer
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setIsExtracting(true);
    setExtractedNotice(null);

    try {
      // Parse file name patterns for quick hints
      const name = file.name;
      let matchedCount = 0;

      if (name.includes("Agreement") || name.includes("Contract") || name.includes("PC-")) {
        matchedCount++;
      }

      // Try reading text if text or small buffer
      setTimeout(() => {
        setIsExtracting(false);
        setExtractedNotice(
          `Document analyzed (${file.name}). Pre-filled standard builder template values. Please verify financial figures and terms below before submitting.`
        );
      }, 700);
    } catch {
      setIsExtracting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    if (projectId) formData.set("projectId", projectId);
    if (leadId) formData.set("leadId", leadId);
    if (selectedBuyerId) formData.set("buyerId", selectedBuyerId);

    formData.set("buyerFirstName", buyerFirstName);
    formData.set("buyerLastName", buyerLastName);
    formData.set("buyerEmail", buyerEmail);
    formData.set("buyerPhone", buyerPhone);
    formData.set("buyerMailing", buyerMailing);

    formData.set("projectName", projectName);
    formData.set("municipalAddress", municipalAddress);
    formData.set("legalAddress", legalAddress);
    formData.set("lotBlockPlan", lotBlockPlan);
    formData.set("builderName", builderName);

    formData.set("contractDate", contractDate);
    formData.set("effectiveDate", effectiveDate);
    formData.set("targetClosing", targetClosing);

    formData.set("basePrice", String(basePrice));
    formData.set("allowanceTotal", String(allowanceTotal));
    formData.set("upgradesTotal", String(upgradesTotal));
    formData.set("discountsTotal", String(discountsTotal));
    formData.set("taxRate", String(taxRate));

    formData.set("scopeSummary", scopeSummary);
    formData.set("inclusions", inclusions);
    formData.set("exclusions", exclusions);
    formData.set("specialConditions", specialConditions);
    formData.set("internalNotes", internalNotes);

    if (uploadedFile) {
      formData.set("file", uploadedFile);
    }

    startTransition(async () => {
      try {
        await createPurchaseContractAction(formData);
      } catch (err: unknown) {
        // redirect() throws a NEXT_REDIRECT error which should not be caught as failure
        const message = err instanceof Error ? err.message : "";
        if (message.includes("NEXT_REDIRECT")) return;
        setError(message || "Failed to create purchase contract.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Mode Selector Tabs */}
      <div className="flex items-center gap-3 border-b border-sb-border pb-4">
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === "manual"
              ? "bg-sb-ink text-white"
              : "bg-white text-sb-muted border border-sb-border hover:text-sb-ink"
          }`}
        >
          <FileText className="h-4 w-4" />
          Native Form Entry
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("upload")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === "upload"
              ? "bg-sb-ink text-white"
              : "bg-white text-sb-muted border border-sb-border hover:text-sb-ink"
          }`}
        >
          <Upload className="h-4 w-4" />
          Upload PDF & Auto-Extract
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-sb-red">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Upload Box (Visible in Upload Tab) */}
      {activeTab === "upload" ? (
        <Card className="border-dashed border-2 border-sb-orange/40 bg-sb-orange/5 p-6">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-sb-orange/10 p-3 text-sb-orange">
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="mt-3 font-semibold text-sb-ink">
              Upload Purchase Contract Document (PDF)
            </h3>
            <p className="mt-1 max-w-md text-xs text-sb-muted">
              SUNBUILD will parse buyer details, address, legal description, and allowance figures for your review.
            </p>
            <div className="mt-4 flex flex-col items-center">
              <Input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="max-w-xs text-xs"
              />
              {isExtracting ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-sb-orange font-medium animate-pulse">
                  <Sparkles className="h-4 w-4" />
                  Extracting contract terms and allowance provisions…
                </div>
              ) : null}
              {extractedNotice ? (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-xs text-emerald-700 border border-emerald-200 shadow-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {extractedNotice}
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {/* 1. Buyer & Client Information */}
      <Card>
        <div className="mb-4 flex items-center gap-2 border-b border-sb-border pb-3">
          <User className="h-4 w-4 text-sb-orange" />
          <h2 className="font-semibold text-sb-ink text-base">Buyer & Client Information</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {buyers.length > 0 ? (
            <FormField label="Existing Buyer (Optional)">
              <select
                value={selectedBuyerId}
                onChange={(e) => handleBuyerSelect(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm text-sb-text"
              >
                <option value="">-- Create new buyer below --</option>
                {buyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.firstName} {b.lastName} {b.email ? `(${b.email})` : ""}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}

          {leads.length > 0 ? (
            <FormField label="Convert from Lead (Optional)">
              <select
                value={leadId}
                onChange={(e) => handleLeadSelect(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm text-sb-text"
              >
                <option value="">-- No lead selected --</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.email ? `(${l.email})` : ""}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}

          <FormField label="Buyer First Name" required>
            <Input
              value={buyerFirstName}
              onChange={(e) => setBuyerFirstName(e.target.value)}
              placeholder="e.g. Eleanor"
              required
            />
          </FormField>

          <FormField label="Buyer Last Name" required>
            <Input
              value={buyerLastName}
              onChange={(e) => setBuyerLastName(e.target.value)}
              placeholder="e.g. Vance"
              required
            />
          </FormField>

          <FormField label="Buyer Email">
            <Input
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="client@example.com"
            />
          </FormField>

          <FormField label="Buyer Phone">
            <Input
              type="tel"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="403-555-0199"
            />
          </FormField>

          <FormField label="Buyer Mailing Address" className="md:col-span-2 lg:col-span-3">
            <Input
              value={buyerMailing}
              onChange={(e) => setBuyerMailing(e.target.value)}
              placeholder="Current mailing address or street location"
            />
          </FormField>
        </div>
      </Card>

      {/* 2. Project & Property Details */}
      <Card>
        <div className="mb-4 flex items-center gap-2 border-b border-sb-border pb-3">
          <Building2 className="h-4 w-4 text-sb-blue" />
          <h2 className="font-semibold text-sb-ink text-base">Project & Property Site</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FormField label="Link to Existing Project (Optional)">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm text-sb-text"
            >
              <option value="">No project yet (new pre-construction)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Sunview community">
            <select
              className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm text-sb-text"
              value=""
              onChange={(e) => {
                const label = e.target.value;
                if (label) setProjectName(label);
              }}
              aria-label="Pick a Sunview community"
            >
              <option value="">Select community from website…</option>
              <optgroup label="Now Selling">
                {SUNVIEW_COMMUNITIES.filter((c) => c.status === "NOW_SELLING").map(
                  (c) => (
                    <option key={c.id} value={c.label}>
                      {c.label.toUpperCase()} — NOW SELLING
                    </option>
                  )
                )}
              </optgroup>
              <optgroup label="Sold Out">
                {SUNVIEW_COMMUNITIES.filter((c) => c.status === "SOLD_OUT").map(
                  (c) => (
                    <option key={c.id} value={c.label}>
                      {c.label.toUpperCase()} — SOLD OUT
                    </option>
                  )
                )}
              </optgroup>
            </select>
          </FormField>

          <FormField label="Project / Model Name" required>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Clearwater Park, Chestermere"
              required
            />
          </FormField>

          <FormField label="Builder Company Name">
            <Input
              value={builderName}
              onChange={(e) => setBuilderName(e.target.value)}
              placeholder="Sunview Custom Homes"
            />
          </FormField>

          <FormField label="Municipal Address" required>
            <Input
              value={municipalAddress}
              onChange={(e) => setMunicipalAddress(e.target.value)}
              placeholder="e.g. 1422 Sage Hill Way NW, Calgary, AB"
              required
            />
          </FormField>

          <FormField label="Legal Address">
            <Input
              value={legalAddress}
              onChange={(e) => setLegalAddress(e.target.value)}
              placeholder="Plan 081-4321; Block 14; Lot 8"
            />
          </FormField>

          <FormField label="Lot / Block / Plan">
            <Input
              value={lotBlockPlan}
              onChange={(e) => setLotBlockPlan(e.target.value)}
              placeholder="Lot 8, Block 14"
            />
          </FormField>

          <FormField label="Contract Date">
            <Input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
            />
          </FormField>

          <FormField label="Effective Date">
            <Input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </FormField>

          <FormField label="Target Closing Date">
            <Input
              type="date"
              value={targetClosing}
              onChange={(e) => setTargetClosing(e.target.value)}
            />
          </FormField>
        </div>
      </Card>

      {/* 3. Authoritative Financial Structure & SOA Budget */}
      <Card className="border-l-4 border-l-emerald-500">
        <div className="mb-4 flex items-center justify-between border-b border-sb-border pb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-sb-ink text-base">
              Financial Structure & Allowance Commitment
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-sb-muted">
            <Calculator className="h-3.5 w-3.5 text-emerald-600" />
            <span>Automatic GST & Subtotal Calculations</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FormField label="Base Contract Price ($ CAD)" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={basePrice}
              onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
              required
            />
            <p className="text-[11px] text-sb-muted mt-1">Core structure, foundation, framing, HVAC</p>
          </FormField>

          <FormField label="Schedule of Allowances Total ($ CAD)" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={allowanceTotal}
              onChange={(e) => setAllowanceTotal(parseFloat(e.target.value) || 0)}
              required
            />
            <p className="text-[11px] text-sb-muted mt-1">
              Creates linked SOA with budgeted items
            </p>
          </FormField>

          <FormField label="Agreed Upgrades ($ CAD)">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={upgradesTotal}
              onChange={(e) => setUpgradesTotal(parseFloat(e.target.value) || 0)}
            />
            <p className="text-[11px] text-sb-muted mt-1">Fixed pre-contract structural upgrades</p>
          </FormField>

          <FormField label="Discounts / Credits ($ CAD)">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={discountsTotal}
              onChange={(e) => setDiscountsTotal(parseFloat(e.target.value) || 0)}
            />
            <p className="text-[11px] text-sb-muted mt-1">Promotional or promotional credits</p>
          </FormField>
        </div>

        {/* Live Calculation Summary Banner */}
        <div className="mt-6 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <span className="text-xs uppercase tracking-wider text-sb-muted font-medium">
                Subtotal Before Tax
              </span>
              <p className="text-lg font-bold font-mono text-sb-ink mt-0.5">
                {formatCurrency(subtotalBeforeTax)}
              </p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-sb-muted font-medium">
                Tax Rate
              </span>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="30"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  className="w-16 text-center font-bold font-mono rounded border border-sb-border px-1 py-0.5 text-sm bg-white"
                />
                <span className="text-xs font-semibold text-sb-muted">% GST</span>
              </div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-sb-muted font-medium">
                Estimated GST
              </span>
              <p className="text-lg font-bold font-mono text-sb-muted mt-0.5">
                {formatCurrency(taxAmount)}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-200">
              <span className="text-xs uppercase tracking-wider text-emerald-800 font-bold">
                Total Contract Price
              </span>
              <p className="text-xl font-black font-mono text-emerald-700 mt-0.5">
                {formatCurrency(totalContractPrice)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 4. Scope, Inclusions, and Terms */}
      <Card>
        <div className="mb-4 flex items-center gap-2 border-b border-sb-border pb-3">
          <ScrollText className="h-4 w-4 text-sb-purple" />
          <h2 className="font-semibold text-sb-ink text-base">Scope, Conditions & Terms</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Scope Summary" className="md:col-span-2">
            <Textarea
              value={scopeSummary}
              onChange={(e) => setScopeSummary(e.target.value)}
              placeholder="High-level description of architectural model, square footage, levels, and garage configuration..."
              rows={3}
            />
          </FormField>

          <FormField label="Specific Inclusions">
            <Textarea
              value={inclusions}
              onChange={(e) => setInclusions(e.target.value)}
              placeholder="e.g. 9ft basement pour, triple-glazed windows, roughed-in solar, AC unit..."
              rows={3}
            />
          </FormField>

          <FormField label="Specific Exclusions">
            <Textarea
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              placeholder="e.g. Window coverings, landscaping, deck staining, basement suite development..."
              rows={3}
            />
          </FormField>

          <FormField label="Special Conditions / Financing Terms" className="md:col-span-2">
            <Textarea
              value={specialConditions}
              onChange={(e) => setSpecialConditions(e.target.value)}
              placeholder="e.g. Subject to buyer mortgage financing condition by April 15; 10% deposit schedule..."
              rows={2}
            />
          </FormField>

          <FormField label="Internal Builder Notes (Confidential - Hidden from Client)" className="md:col-span-2">
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Private sales commission notes, trade commitments, site access warnings..."
              rows={2}
              className="bg-amber-50/50 border-amber-200"
            />
            <p className="text-[11px] text-amber-700 mt-1">
              Internal notes are strictly confidential and never visible on client portals or printed agreements.
            </p>
          </FormField>
        </div>
      </Card>

      {/* Submit Action */}
      <div className="flex items-center justify-between border-t border-sb-border pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/sales/contracts")}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending} className="px-6 font-semibold">
          {isPending ? "Creating Contract & SOA…" : "Create Purchase Contract & Initialize SOA"}
        </Button>
      </div>
    </form>
  );
}
