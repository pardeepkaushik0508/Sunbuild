/**
 * Single source of truth for company letterhead on Statement of Adjustments.
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
  addressLine1: "Calgary, Alberta",
  addressLine2: null,
  city: "Calgary",
  province: "AB",
  postalCode: "",
  /** SOA letterhead does not print GST — kept empty for client format. */
  gstNumber: "",
  cityLine: "Calgary, Alberta",
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
  const postalCode = company.postalCode?.trim() || "";
  // Do not invent a GST # for SOA letterhead when company has none.
  const gstNumber = company.gstNumber?.trim() || "";

  const cityParts = [city, province, postalCode].filter(Boolean);
  const cityLine =
    cityParts.length > 0
      ? cityParts.join(cityParts.length === 3 ? "  " : ", ").replace(
          /^([^,]+),\s*([^,\s]+)\s+(.+)$/,
          "$1, $2  $3"
        )
      : SUNVIEW_DEFAULTS.cityLine;

  // Prefer explicit addressLine1; if DB only has city fields, compose.
  const composedCity =
    [city, province].filter(Boolean).join(", ") +
    (postalCode ? `  ${postalCode}` : "");

  return {
    legalName: legalName.toUpperCase().includes("SUNVIEW")
      ? legalName.toUpperCase().replace(/\s+/g, " ")
      : legalName,
    addressLine1:
      company.addressLine1?.trim() ||
      (company.city ? composedCity : addressLine1),
    addressLine2,
    city,
    province,
    postalCode,
    gstNumber: !gstNumber
      ? ""
      : gstNumber.startsWith("GST")
        ? gstNumber
        : `GST # ${gstNumber}`,
    cityLine: company.addressLine1?.trim()
      ? [
          [city, province].filter(Boolean).join(", "),
          postalCode,
        ]
          .filter(Boolean)
          .join("  ") || cityLine
      : composedCity || cityLine,
  };
}
