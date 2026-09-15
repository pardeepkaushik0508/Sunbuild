/**
 * Single source of truth for company letterhead on Statement of Adjustments.
 * Defaults match the Sunview Custom Homes client reference document.
 */

export type CompanyLegalInfo = {
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  gstNumber: string;
  /** Combined city / province / postal for PDF lines. */
  cityLine: string;
};

const SUNVIEW_DEFAULTS: CompanyLegalInfo = {
  legalName: "SUNVIEW CUSTOM HOMES",
  addressLine1: "204, 110 Country Hills Landing NW",
  addressLine2: null,
  city: "Calgary",
  province: "AB",
  postalCode: "T3K 5P3",
  gstNumber: "GST # 85809-6498 RT 0001",
  cityLine: "Calgary, AB T3K 5P3",
};

export function resolveCompanyLegalInfo(company: {
  name?: string | null;
  brand?: string | null;
  legalName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  gstNumber?: string | null;
} | null): CompanyLegalInfo {
  if (!company) return { ...SUNVIEW_DEFAULTS };

  const legalName =
    company.legalName?.trim() ||
    company.brand?.trim() ||
    company.name?.trim() ||
    SUNVIEW_DEFAULTS.legalName;

  const addressLine1 =
    company.addressLine1?.trim() || SUNVIEW_DEFAULTS.addressLine1;
  const addressLine2 = company.addressLine2?.trim() || null;
  const city = company.city?.trim() || SUNVIEW_DEFAULTS.city;
  const province = company.province?.trim() || SUNVIEW_DEFAULTS.province;
  const postalCode =
    company.postalCode?.trim() || SUNVIEW_DEFAULTS.postalCode;
  const rawGst = company.gstNumber?.trim() || "";
  const gstNumber = !rawGst
    ? SUNVIEW_DEFAULTS.gstNumber
    : rawGst.startsWith("GST")
      ? rawGst
      : `GST # ${rawGst}`;

  const cityLine = [city, province, postalCode].filter(Boolean).join(" ");

  return {
    legalName: legalName.toUpperCase().includes("SUNVIEW")
      ? legalName.toUpperCase().replace(/\s+/g, " ")
      : legalName,
    addressLine1,
    addressLine2,
    city,
    province,
    postalCode,
    gstNumber,
    cityLine: cityLine || SUNVIEW_DEFAULTS.cityLine,
  };
}
