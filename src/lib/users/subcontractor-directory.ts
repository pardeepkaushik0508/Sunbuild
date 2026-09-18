/**
 * Canonical subcontractor / vendor directory from
 * docs/Sunview-Master-Test-Data-v2.2.txt §9.
 * Do not invent vendors that are not in that document.
 */

export type DirectoryVendor = {
  company: string;
  trade: string;
  specialisation: string;
  phone: string;
  email: string;
  slot: "A" | "B";
};

const DIRECTORY: Array<{
  specialisation: string;
  trade: string;
  vendorA: string;
  vendorB: string;
  blockA: string;
  blockB: string;
}> = [
  {
    specialisation: "Excavation & earthmoving",
    trade: "Excavation",
    vendorA: "Prairie Earthworks",
    vendorB: "Foothills Excavating",
    blockA: "0201",
    blockB: "0202",
  },
  {
    specialisation: "Concrete & foundations",
    trade: "Concrete",
    vendorA: "Solid Foundation Calgary",
    vendorB: "Rocky View Concrete Prep",
    blockA: "0203",
    blockB: "0204",
  },
  {
    specialisation: "Framing carpentry",
    trade: "Framing",
    vendorA: "Bow River Framing & Carpentry",
    vendorB: "Foothills Custom Framers",
    blockA: "0205",
    blockB: "0206",
  },
  {
    specialisation: "Roofing & envelopes",
    trade: "Roofing",
    vendorA: "Peak Protection Roofing",
    vendorB: "Western Sky Roofers",
    blockA: "0207",
    blockB: "0208",
  },
  {
    specialisation: "Exterior masonry",
    trade: "Masonry",
    vendorA: "Foothills Masonry & Stone",
    vendorB: "Calgary Brick & Block",
    blockA: "0209",
    blockB: "0210",
  },
  {
    specialisation: "Plumbing systems",
    trade: "Plumbing",
    vendorA: "Streamline Plumbers Calgary",
    vendorB: "Instant Flow Plumbing",
    blockA: "0211",
    blockB: "0212",
  },
  {
    specialisation: "HVAC & ventilation",
    trade: "HVAC",
    vendorA: "Advanced Heating & Air",
    vendorB: "Prairie Wind Heating & Cooling",
    blockA: "0213",
    blockB: "0214",
  },
  {
    specialisation: "Electrical installations",
    trade: "Electrical",
    vendorA: "Hardwire Electric Calgary",
    vendorB: "Chinook Spark & Wire",
    blockA: "0215",
    blockB: "0216",
  },
  {
    specialisation: "Building insulation",
    trade: "Insulation",
    vendorA: "WarmHome Insulation Calgary",
    vendorB: "Peak Energy Installers",
    blockA: "0217",
    blockB: "0218",
  },
  {
    specialisation: "Drywall & acoustic",
    trade: "Drywall",
    vendorA: "Stampede City Drywall",
    vendorB: "Alberta Mud & Tape Pros",
    blockA: "0219",
    blockB: "0220",
  },
  {
    specialisation: "Finishing painting",
    trade: "Painting",
    vendorA: "Heritage Paint & Decorators",
    vendorB: "Summit Coating Solutions",
    blockA: "0221",
    blockB: "0222",
  },
  {
    specialisation: "Cabinetry & millwork",
    trade: "Cabinetry",
    vendorA: "Bow Valley Cabinets",
    vendorB: "Custom Woodcraft Calgary",
    blockA: "0223",
    blockB: "0224",
  },
  {
    specialisation: "Stone countertops",
    trade: "Countertops",
    vendorA: "Rocky Mountain Stone",
    vendorB: "Calgary Quartz & Granite",
    blockA: "0225",
    blockB: "0226",
  },
  {
    specialisation: "Hard surface flooring",
    trade: "Flooring",
    vendorA: "Bow Valley Hardwood & Tile",
    vendorB: "Stampede Floor Coverings",
    blockA: "0227",
    blockB: "0228",
  },
  {
    specialisation: "Interior finish carpentry",
    trade: "Finish carpentry",
    vendorA: "Foothills Finishers",
    vendorB: "Calgary Trim & Door",
    blockA: "0229",
    blockB: "0230",
  },
  {
    specialisation: "Civil & landscaping",
    trade: "Landscaping",
    vendorA: "Chinook Landscapes",
    vendorB: "Prairie Hardscapes",
    blockA: "0231",
    blockB: "0232",
  },
  {
    specialisation: "Turnover cleaning",
    trade: "Cleaning",
    vendorA: "Crystal Clean Construction",
    vendorB: "Post-Build Maids Calgary",
    blockA: "0233",
    blockB: "0234",
  },
];

function slugEmail(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function phoneForBlock(block: string): string {
  return `1403555${block}`;
}

export function subcontractorDirectory(): DirectoryVendor[] {
  const rows: DirectoryVendor[] = [];
  for (const row of DIRECTORY) {
    rows.push({
      company: row.vendorA,
      trade: row.trade,
      specialisation: row.specialisation,
      phone: phoneForBlock(row.blockA),
      email: `${slugEmail(row.vendorA)}@vendors.sunview.test`,
      slot: "A",
    });
    rows.push({
      company: row.vendorB,
      trade: row.trade,
      specialisation: row.specialisation,
      phone: phoneForBlock(row.blockB),
      email: `${slugEmail(row.vendorB)}@vendors.sunview.test`,
      slot: "B",
    });
  }
  return rows;
}

/** Named people already in Master Test Data §22 — keep their real emails. */
export const NAMED_SUBCONTRACTORS = [
  {
    email: "dev@bowriverframing.ca",
    name: "Dev Patel",
    company: "Bow River Framing & Carpentry",
    trade: "Framing",
    phone: "15875550205",
  },
  {
    email: "lucia@bowvalleycabinets.ca",
    name: "Lucia Romero",
    company: "Bow Valley Cabinets",
    trade: "Cabinetry",
    phone: "14035550223",
  },
] as const;
