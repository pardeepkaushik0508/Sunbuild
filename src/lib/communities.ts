/**
 * Sunview Custom Homes communities from sunviewhomes.ca Communities menu.
 * Used for seed data, purchase-agreement project naming, and pickers.
 */

export type CommunityStatus = "NOW_SELLING" | "SOLD_OUT";

export type SunviewCommunity = {
  id: string;
  name: string;
  location: string;
  /** Display label e.g. "Clearwater Park, Chestermere" */
  label: string;
  status: CommunityStatus;
};

export const SUNVIEW_COMMUNITIES: SunviewCommunity[] = [
  {
    id: "clearwater-park-chestermere",
    name: "Clearwater Park",
    location: "Chestermere",
    label: "Clearwater Park, Chestermere",
    status: "NOW_SELLING",
  },
  {
    id: "waterford-chestermere",
    name: "Waterford",
    location: "Chestermere",
    label: "Waterford, Chestermere",
    status: "NOW_SELLING",
  },
  {
    id: "southshore-chestermere-lake",
    name: "Southshore",
    location: "Chestermere Lake",
    label: "Southshore, Chestermere Lake",
    status: "NOW_SELLING",
  },
  {
    id: "edgefield-phase-3-strathmore",
    name: "Edgefield Phase 3",
    location: "Strathmore",
    label: "Edgefield Phase 3, Strathmore",
    status: "NOW_SELLING",
  },
  {
    id: "waterford-estates-chestermere",
    name: "Waterford Estates",
    location: "Chestermere",
    label: "Waterford Estates, Chestermere",
    status: "SOLD_OUT",
  },
  {
    id: "edgefield-phase-1-2-strathmore",
    name: "Edgefield Phase 1/2",
    location: "Strathmore",
    label: "Edgefield Phase 1/2, Strathmore",
    status: "SOLD_OUT",
  },
  {
    id: "sherwood",
    name: "Sherwood",
    location: "",
    label: "Sherwood",
    status: "SOLD_OUT",
  },
  {
    id: "nolan-hill",
    name: "Nolan Hill",
    location: "",
    label: "Nolan Hill",
    status: "SOLD_OUT",
  },
  {
    id: "the-ranch-strathmore",
    name: "The Ranch",
    location: "Strathmore",
    label: "The Ranch, Strathmore",
    status: "SOLD_OUT",
  },
];

export const SUNVIEW_NOW_SELLING = SUNVIEW_COMMUNITIES.filter(
  (c) => c.status === "NOW_SELLING"
);

export function communityStatusLabel(status: CommunityStatus) {
  return status === "NOW_SELLING" ? "Now Selling" : "Sold Out";
}
