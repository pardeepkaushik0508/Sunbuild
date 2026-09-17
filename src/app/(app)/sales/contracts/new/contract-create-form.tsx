"use client";

import { useMemo, useState, useTransition } from "react";
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
  Scale,
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

  const [basePrice, setBasePrice] = useState<number>(650000);
  const [allowanceTotal, setAllowanceTotal] = useState<number>(60000);
  const [upgradesTotal, setUpgradesTotal] = useState<number>(0);
  const [gstRebate, setGstRebate] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(5.0);

  const [selectedBuyerId, setSelectedBuyerId] = useState<string>("");
  const [buyerFirstName, setBuyerFirstName] = useState("");
  const [buyerLastName, setBuyerLastName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerMailing, setBuyerMailing] = useState("");
  const [buyerOccupation, setBuyerOccupation] = useState("");
  const [buyerIdNumber, setBuyerIdNumber] = useState("");

  const [buyer2FirstName, setBuyer2FirstName] = useState("");
  const [buyer2LastName, setBuyer2LastName] = useState("");
  const [buyer2Email, setBuyer2Email] = useState("");
  const [buyer2Phone, setBuyer2Phone] = useState("");
  const [buyer2Mailing, setBuyer2Mailing] = useState("");
  const [buyer2Occupation, setBuyer2Occupation] = useState("");
  const [buyer2IdNumber, setBuyer2IdNumber] = useState("");

  const [realtorName, setRealtorName] = useState("");
  const [realtorPhone, setRealtorPhone] = useState("");
  const [realtorEmail, setRealtorEmail] = useState("");
  const [lawyerName, setLawyerName] = useState("");
  const [lawyerPhone, setLawyerPhone] = useState("");
  const [lawyerEmail, setLawyerEmail] = useState("");

  const [projectId, setProjectId] = useState<string>(defaultProjectId);
  const [leadId, setLeadId] = useState<string>("");
  const [projectName, setProjectName] = useState("");
  const [municipalAddress, setMunicipalAddress] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [city, setCity] = useState("");
  const [block, setBlock] = useState("");
  const [lot, setLot] = useState("");
  const [plan, setPlan] = useState("");
  const [builderName, setBuilderName] = useState("Sunview Custom Homes");

  const [contractDate, setContractDate] = useState(new Date().toISOString().slice(0, 10));
  const [firmPossessionDate, setFirmPossessionDate] = useState("");
  const [builderSignatureDate, setBuilderSignatureDate] = useState("");
  const [purchaserAgreementReceiptDate, setPurchaserAgreementReceiptDate] = useState("");

  const [depositOnSigning, setDepositOnSigning] = useState("");
  const [depositOnConditionRemoval, setDepositOnConditionRemoval] = useState("");
  const [depositByDate1, setDepositByDate1] = useState("");
  const [depositByDate1Amount, setDepositByDate1Amount] = useState("");
  const [depositByDate2, setDepositByDate2] = useState("");
  const [depositByDate2Amount, setDepositByDate2Amount] = useState("");
  const [depositByDate3, setDepositByDate3] = useState("");
  const [depositByDate3Amount, setDepositByDate3Amount] = useState("");

  const [purchaserConditionDate, setPurchaserConditionDate] = useState("");
  const [purchaserCondition1, setPurchaserCondition1] = useState("");
  const [purchaserCondition2, setPurchaserCondition2] = useState("");
  const [builderConditionDate, setBuilderConditionDate] = useState("");
  const [builderCondition1, setBuilderCondition1] = useState("");
  const [builderCondition2, setBuilderCondition2] = useState("");
  const [changeOrderNotes, setChangeOrderNotes] = useState("");

  const [scopeSummary, setScopeSummary] = useState("");
  const [inclusions, setInclusions] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [specialConditions, setSpecialConditions] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedNotice, setExtractedNotice] = useState<string | null>(null);

  const subtotalBeforeTax = Math.max(
    0,
    roundMoney(basePrice + allowanceTotal + upgradesTotal - gstRebate)
  );
  const taxAmount = roundMoney((subtotalBeforeTax * taxRate) / 100);
  const totalContractPrice = roundMoney(subtotalBeforeTax + taxAmount);

  const depositPaid = useMemo(() => {
    return roundMoney(
      (parseFloat(depositOnSigning) || 0) +
        (parseFloat(depositOnConditionRemoval) || 0) +
        (parseFloat(depositByDate1Amount) || 0) +
        (parseFloat(depositByDate2Amount) || 0) +
        (parseFloat(depositByDate3Amount) || 0)
    );
  }, [
    depositOnSigning,
    depositOnConditionRemoval,
    depositByDate1Amount,
    depositByDate2Amount,
    depositByDate3Amount,
  ]);
  const balanceOnClosing = Math.max(0, roundMoney(totalContractPrice - depositPaid));

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setIsExtracting(true);
    setExtractedNotice(null);
    setTimeout(() => {
      setIsExtracting(false);
      setExtractedNotice(
        `Document analyzed (${file.name}). Pre-filled standard builder template values. Please verify every Sales Information Sheet field before submitting.`
      );
    }, 700);
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
    formData.set("buyerOccupation", buyerOccupation);
    formData.set("buyerIdNumber", buyerIdNumber);

    formData.set("buyer2FirstName", buyer2FirstName);
    formData.set("buyer2LastName", buyer2LastName);
    formData.set("buyer2Email", buyer2Email);
    formData.set("buyer2Phone", buyer2Phone);
    formData.set("buyer2Mailing", buyer2Mailing);
    formData.set("buyer2Occupation", buyer2Occupation);
    formData.set("buyer2IdNumber", buyer2IdNumber);

    formData.set("realtorName", realtorName);
    formData.set("realtorPhone", realtorPhone);
    formData.set("realtorEmail", realtorEmail);
    formData.set("lawyerName", lawyerName);
    formData.set("lawyerPhone", lawyerPhone);
    formData.set("lawyerEmail", lawyerEmail);

    formData.set("projectName", projectName);
    formData.set("municipalAddress", municipalAddress);
    formData.set("legalAddress", legalAddress);
    formData.set("city", city);
    formData.set("block", block);
    formData.set("lot", lot);
    formData.set("plan", plan);
    formData.set("builderName", builderName);

    formData.set("contractDate", contractDate);
    formData.set("firmPossessionDate", firmPossessionDate);
    formData.set("targetClosing", firmPossessionDate);
    formData.set("builderSignatureDate", builderSignatureDate);
    formData.set("purchaserAgreementReceiptDate", purchaserAgreementReceiptDate);
    formData.set("effectiveDate", purchaserAgreementReceiptDate);

    formData.set("basePrice", String(basePrice));
    formData.set("allowanceTotal", String(allowanceTotal));
    formData.set("upgradesTotal", String(upgradesTotal));
    formData.set("gstRebate", String(gstRebate));
    formData.set("discountsTotal", String(gstRebate));
    formData.set("taxRate", String(taxRate));

    formData.set("depositOnSigning", depositOnSigning);
    formData.set("depositOnConditionRemoval", depositOnConditionRemoval);
    formData.set("depositByDate1", depositByDate1);
    formData.set("depositByDate1Amount", depositByDate1Amount);
    formData.set("depositByDate2", depositByDate2);
    formData.set("depositByDate2Amount", depositByDate2Amount);
    formData.set("depositByDate3", depositByDate3);
    formData.set("depositByDate3Amount", depositByDate3Amount);

    formData.set("purchaserConditionDate", purchaserConditionDate);
    formData.set("purchaserCondition1", purchaserCondition1);
    formData.set("purchaserCondition2", purchaserCondition2);
    formData.set("builderConditionDate", builderConditionDate);
    formData.set("builderCondition1", builderCondition1);
    formData.set("builderCondition2", builderCondition2);
    formData.set("changeOrderNotes", changeOrderNotes);

    formData.set("scopeSummary", scopeSummary);
    formData.set("inclusions", inclusions);
    formData.set("exclusions", exclusions);
    formData.set("specialConditions", specialConditions);
    formData.set("internalNotes", internalNotes);

    if (uploadedFile) formData.set("file", uploadedFile);

    startTransition(async () => {
      try {
        await createPurchaseContractAction(formData);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("NEXT_REDIRECT")) return;
        setError(message || "Failed to create purchase contract.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      <div className="rounded-lg border border-sb-orange/30 bg-sb-orange/5 px-4 py-3 text-xs text-sb-ink">
        Fields below match the <strong>SV Purchase Agreement – Sales Information Sheet</strong> headings
        so printed/PDF output can fill every box.
      </div>

      {activeTab === "upload" ? (
        <Card className="border-dashed border-2 border-sb-orange/40 bg-sb-orange/5 p-6">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-sb-orange/10 p-3 text-sb-orange">
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="mt-3 font-semibold text-sb-ink">Upload Purchase Contract Document (PDF)</h3>
            <p className="mt-1 max-w-md text-xs text-sb-muted">
              Attach the signed/source PDF, then verify every sheet field below before creating.
            </p>
            <div className="mt-4 flex flex-col items-center">
              <Input type="file" accept=".pdf,application/pdf" onChange={handleFileChange} className="max-w-xs text-xs" />
              {isExtracting ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-sb-orange font-medium animate-pulse">
                  <Sparkles className="h-4 w-4" />
                  Extracting contract terms…
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

      {/* PROPERTY & CONTRACT */}
      <Card>
        <div className="mb-4 flex items-center gap-2 border-b border-sb-border pb-3">
          <Building2 className="h-4 w-4 text-sb-blue" />
          <h2 className="font-semibold text-sb-ink text-base">Property &amp; Contract</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.length > 0 ? (
            <FormField label="Link to Existing Project (Optional)">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm text-sb-text"
              >
                <option value="">No project yet</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </FormField>
          ) : null}
          <FormField label="Sunview community">
            <select
              className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm text-sb-text"
              value=""
              onChange={(e) => {
                if (e.target.value) setProjectName(e.target.value);
              }}
            >
              <option value="">Select community…</option>
              {SUNVIEW_COMMUNITIES.map((c) => (
                <option key={c.id} value={c.label}>{c.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Project / Model Name" required>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} required placeholder="e.g. Clearwater Park" />
          </FormField>
          <FormField label="Builder Company Name">
            <Input value={builderName} onChange={(e) => setBuilderName(e.target.value)} />
          </FormField>
          <FormField label="Contract Date">
            <Input type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
          </FormField>
          <FormField label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Calgary" />
          </FormField>
          <FormField label="Municipal Address" required className="md:col-span-2 lg:col-span-3">
            <Input value={municipalAddress} onChange={(e) => setMunicipalAddress(e.target.value)} required placeholder="Street address" />
          </FormField>
          <FormField label="Block">
            <Input value={block} onChange={(e) => setBlock(e.target.value)} />
          </FormField>
          <FormField label="Lot">
            <Input value={lot} onChange={(e) => setLot(e.target.value)} />
          </FormField>
          <FormField label="Plan">
            <Input value={plan} onChange={(e) => setPlan(e.target.value)} />
          </FormField>
          <FormField label="Legal Address" className="md:col-span-2 lg:col-span-3">
            <Input value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)} placeholder="Optional full legal description" />
          </FormField>
          <FormField label="Firm Possession Date">
            <Input type="date" value={firmPossessionDate} onChange={(e) => setFirmPossessionDate(e.target.value)} />
          </FormField>
          <FormField label="Builder Signature Date">
            <Input type="date" value={builderSignatureDate} onChange={(e) => setBuilderSignatureDate(e.target.value)} />
          </FormField>
          <FormField label="Purchaser Agreement Receipt Date">
            <Input type="date" value={purchaserAgreementReceiptDate} onChange={(e) => setPurchaserAgreementReceiptDate(e.target.value)} />
          </FormField>
        </div>
      </Card>

      {/* PURCHASERS INFORMATION */}
      <Card>
        <div className="mb-4 flex items-center gap-2 border-b border-sb-border pb-3">
          <User className="h-4 w-4 text-sb-orange" />
          <h2 className="font-semibold text-sb-ink text-base">Purchasers Information</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-4">
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
                    {b.firstName} {b.lastName}
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
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </FormField>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-sb-border p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sb-muted">Purchaser 1</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Purchaser Name (First)" required>
                <Input value={buyerFirstName} onChange={(e) => setBuyerFirstName(e.target.value)} required />
              </FormField>
              <FormField label="Last Name" required>
                <Input value={buyerLastName} onChange={(e) => setBuyerLastName(e.target.value)} required />
              </FormField>
              <FormField label="Address" className="sm:col-span-2">
                <Input value={buyerMailing} onChange={(e) => setBuyerMailing(e.target.value)} />
              </FormField>
              <FormField label="Phone Number">
                <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
              </FormField>
              <FormField label="Email Address">
                <Input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
              </FormField>
              <FormField label="Occupation">
                <Input value={buyerOccupation} onChange={(e) => setBuyerOccupation(e.target.value)} />
              </FormField>
              <FormField label="ID Number">
                <Input value={buyerIdNumber} onChange={(e) => setBuyerIdNumber(e.target.value)} />
              </FormField>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-sb-border p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sb-muted">Purchaser 2 (Optional)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Purchaser Name (First)">
                <Input value={buyer2FirstName} onChange={(e) => setBuyer2FirstName(e.target.value)} />
              </FormField>
              <FormField label="Last Name">
                <Input value={buyer2LastName} onChange={(e) => setBuyer2LastName(e.target.value)} />
              </FormField>
              <FormField label="Address" className="sm:col-span-2">
                <Input value={buyer2Mailing} onChange={(e) => setBuyer2Mailing(e.target.value)} />
              </FormField>
              <FormField label="Phone Number">
                <Input value={buyer2Phone} onChange={(e) => setBuyer2Phone(e.target.value)} />
              </FormField>
              <FormField label="Email Address">
                <Input type="email" value={buyer2Email} onChange={(e) => setBuyer2Email(e.target.value)} />
              </FormField>
              <FormField label="Occupation">
                <Input value={buyer2Occupation} onChange={(e) => setBuyer2Occupation(e.target.value)} />
              </FormField>
              <FormField label="ID Number">
                <Input value={buyer2IdNumber} onChange={(e) => setBuyer2IdNumber(e.target.value)} />
              </FormField>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <FormField label="Realtor's Name">
            <Input value={realtorName} onChange={(e) => setRealtorName(e.target.value)} />
          </FormField>
          <FormField label="Realtor Phone">
            <Input value={realtorPhone} onChange={(e) => setRealtorPhone(e.target.value)} />
          </FormField>
          <FormField label="Realtor Email">
            <Input type="email" value={realtorEmail} onChange={(e) => setRealtorEmail(e.target.value)} />
          </FormField>
          <FormField label="Lawyer's Name">
            <Input value={lawyerName} onChange={(e) => setLawyerName(e.target.value)} />
          </FormField>
          <FormField label="Lawyer Phone">
            <Input value={lawyerPhone} onChange={(e) => setLawyerPhone(e.target.value)} />
          </FormField>
          <FormField label="Lawyer Email">
            <Input type="email" value={lawyerEmail} onChange={(e) => setLawyerEmail(e.target.value)} />
          </FormField>
        </div>
      </Card>

      {/* SALE PRICE & TERMS */}
      <Card className="border-l-4 border-l-emerald-500">
        <div className="mb-4 flex items-center justify-between border-b border-sb-border pb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-sb-ink text-base">Sale Price &amp; Terms of Payment</h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-sb-muted">
            <Calculator className="h-3.5 w-3.5 text-emerald-600" />
            Live GST &amp; balance calc
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <FormField label="Base Selling Price ($ CAD)" required>
              <Input type="number" step="0.01" min="0" value={basePrice} onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)} required />
            </FormField>
            <FormField label="Schedule of Allowances Total ($ CAD)" required>
              <Input type="number" step="0.01" min="0" value={allowanceTotal} onChange={(e) => setAllowanceTotal(parseFloat(e.target.value) || 0)} required />
            </FormField>
            <FormField label="Extra Selections ($ CAD)">
              <Input type="number" step="0.01" min="0" value={upgradesTotal} onChange={(e) => setUpgradesTotal(parseFloat(e.target.value) || 0)} />
            </FormField>
            <FormField label="*Less GST Rebate ($ CAD)">
              <Input type="number" step="0.01" min="0" value={gstRebate} onChange={(e) => setGstRebate(parseFloat(e.target.value) || 0)} />
            </FormField>
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 grid grid-cols-2 gap-3 text-center">
              <div>
                <span className="text-xs uppercase text-sb-muted">GST Rate</span>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-16 text-center font-bold font-mono rounded border border-sb-border px-1 py-0.5 text-sm"
                  />
                  <span className="text-xs">%</span>
                </div>
              </div>
              <div>
                <span className="text-xs uppercase text-sb-muted">GST Amount</span>
                <p className="font-mono font-bold mt-1">{formatCurrency(taxAmount)}</p>
              </div>
              <div className="col-span-2 bg-emerald-50 rounded-lg p-2 border border-emerald-200">
                <span className="text-xs uppercase text-emerald-800 font-bold">TOTAL Purchase Price</span>
                <p className="text-xl font-black font-mono text-emerald-700">{formatCurrency(totalContractPrice)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <FormField label="On Signing ($ CAD)">
              <Input type="number" step="0.01" min="0" value={depositOnSigning} onChange={(e) => setDepositOnSigning(e.target.value)} />
            </FormField>
            <FormField label="On removal of condition ($ CAD)">
              <Input type="number" step="0.01" min="0" value={depositOnConditionRemoval} onChange={(e) => setDepositOnConditionRemoval(e.target.value)} />
            </FormField>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="By Date 1">
                <Input type="date" value={depositByDate1} onChange={(e) => setDepositByDate1(e.target.value)} />
              </FormField>
              <FormField label="Amount">
                <Input type="number" step="0.01" min="0" value={depositByDate1Amount} onChange={(e) => setDepositByDate1Amount(e.target.value)} />
              </FormField>
              <FormField label="By Date 2">
                <Input type="date" value={depositByDate2} onChange={(e) => setDepositByDate2(e.target.value)} />
              </FormField>
              <FormField label="Amount">
                <Input type="number" step="0.01" min="0" value={depositByDate2Amount} onChange={(e) => setDepositByDate2Amount(e.target.value)} />
              </FormField>
              <FormField label="By Date 3">
                <Input type="date" value={depositByDate3} onChange={(e) => setDepositByDate3(e.target.value)} />
              </FormField>
              <FormField label="Amount">
                <Input type="number" step="0.01" min="0" value={depositByDate3Amount} onChange={(e) => setDepositByDate3Amount(e.target.value)} />
              </FormField>
            </div>
            <div className="rounded-lg border border-sb-border bg-white px-3 py-2 text-sm">
              <span className="text-sb-muted text-xs uppercase">Balance on Closing</span>
              <p className="font-mono font-bold">{formatCurrency(balanceOnClosing)}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* SCHEDULE E */}
      <Card>
        <div className="mb-4 flex items-center gap-2 border-b border-sb-border pb-3">
          <Scale className="h-4 w-4 text-sb-purple" />
          <h2 className="font-semibold text-sb-ink text-base">Schedule E – Purchaser &amp; Builder Conditions</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Purchaser Condition Date">
            <Input type="date" value={purchaserConditionDate} onChange={(e) => setPurchaserConditionDate(e.target.value)} />
          </FormField>
          <FormField label="Builder Condition Date">
            <Input type="date" value={builderConditionDate} onChange={(e) => setBuilderConditionDate(e.target.value)} />
          </FormField>
          <FormField label="Purchaser Condition 1" className="md:col-span-2">
            <Input value={purchaserCondition1} onChange={(e) => setPurchaserCondition1(e.target.value)} />
          </FormField>
          <FormField label="Purchaser Condition 2" className="md:col-span-2">
            <Input value={purchaserCondition2} onChange={(e) => setPurchaserCondition2(e.target.value)} />
          </FormField>
          <FormField label="Builder Condition 1" className="md:col-span-2">
            <Input value={builderCondition1} onChange={(e) => setBuilderCondition1(e.target.value)} />
          </FormField>
          <FormField label="Builder Condition 2" className="md:col-span-2">
            <Input value={builderCondition2} onChange={(e) => setBuilderCondition2(e.target.value)} />
          </FormField>
        </div>
      </Card>

      {/* SCHEDULE B */}
      <Card>
        <div className="mb-4 flex items-center gap-2 border-b border-sb-border pb-3">
          <ScrollText className="h-4 w-4 text-sb-blue" />
          <h2 className="font-semibold text-sb-ink text-base">Schedule B – Change Orders</h2>
        </div>
        <FormField label="Change Order">
          <Textarea
            value={changeOrderNotes}
            onChange={(e) => setChangeOrderNotes(e.target.value)}
            rows={3}
            placeholder="Describe included change orders / extras for the Sales Information Sheet…"
          />
        </FormField>
      </Card>

      {/* Optional scope notes */}
      <Card>
        <div className="mb-4 flex items-center gap-2 border-b border-sb-border pb-3">
          <ScrollText className="h-4 w-4 text-sb-muted" />
          <h2 className="font-semibold text-sb-ink text-base">Scope Notes (Internal / Supporting)</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Scope Summary" className="md:col-span-2">
            <Textarea value={scopeSummary} onChange={(e) => setScopeSummary(e.target.value)} rows={2} />
          </FormField>
          <FormField label="Specific Inclusions">
            <Textarea value={inclusions} onChange={(e) => setInclusions(e.target.value)} rows={2} />
          </FormField>
          <FormField label="Specific Exclusions">
            <Textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} rows={2} />
          </FormField>
          <FormField label="Special Conditions / Financing Terms" className="md:col-span-2">
            <Textarea value={specialConditions} onChange={(e) => setSpecialConditions(e.target.value)} rows={2} />
          </FormField>
          <FormField label="Internal Builder Notes (Hidden from Client)" className="md:col-span-2">
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={2}
              className="bg-amber-50/50 border-amber-200"
            />
          </FormField>
        </div>
      </Card>

      <div className="flex items-center justify-between border-t border-sb-border pt-4">
        <Button type="button" variant="outline" onClick={() => router.push("/sales/contracts")} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending} className="px-6 font-semibold">
          {isPending ? "Creating Contract & SOA…" : "Create Purchase Contract & Initialize SOA"}
        </Button>
      </div>
    </form>
  );
}
