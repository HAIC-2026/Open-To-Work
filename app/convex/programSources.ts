/**
 * Public programs the agent may recommend, and the official pages their
 * details come from. `npx convex run programs:refresh` fetches each source,
 * stores its text, and has the model condense it into the summary the agent
 * reads. Only official agency pages and forms belong in `sources`.
 *
 * Sources whose sites block automated requests are read from saved copies in
 * programCaptures.ts instead; update those by hand when the page changes.
 */
export interface ProgramSource {
  slug: string
  name: string
  agency: string
  officialUrl: string
  applyUrl?: string
  /** Search words beyond what the summary will contain. */
  keywords: string
  /** Official pages and PDFs, most important first. */
  sources: string[]
}

const DHS_BESSD = "Hawaiʻi Department of Human Services, Benefit, Employment and Support Services Division"
const DOTAX = "Hawaiʻi Department of Taxation"
const PAIS = "https://pais.dhs.hawaii.gov/PAIS/#!/"

export const PROGRAM_SOURCES: ReadonlyArray<ProgramSource> = [
  {
    slug: "snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    agency: DHS_BESSD,
    officialUrl: "https://humanservices.hawaii.gov/bessd/snap/",
    applyUrl: PAIS,
    keywords: "food groceries EBT food stamps nutrition low income",
    sources: ["https://humanservices.hawaii.gov/bessd/snap/"],
  },
  {
    slug: "tanf",
    name: "Temporary Assistance for Needy Families (TANF) / Temporary Assistance for Other Needy Families (TAONF)",
    agency: DHS_BESSD,
    officialUrl: "https://humanservices.hawaii.gov/bessd/tanf/",
    applyUrl: PAIS,
    keywords: "cash assistance families children welfare First-To-Work employment",
    sources: ["https://humanservices.hawaii.gov/bessd/tanf/"],
  },
  {
    slug: "general-assistance",
    name: "General Assistance (GA)",
    agency: DHS_BESSD,
    officialUrl: "https://humanservices.hawaii.gov/bessd/ga/",
    keywords: "cash assistance disabled adults temporary disability",
    sources: ["https://humanservices.hawaii.gov/bessd/ga/"],
  },
  {
    slug: "aabd",
    name: "Aid to the Aged, Blind, and Disabled (AABD)",
    agency: DHS_BESSD,
    officialUrl: "https://humanservices.hawaii.gov/bessd/aabd/",
    keywords: "cash assistance kupuna kūpuna seniors elderly blind disabled",
    sources: ["https://humanservices.hawaii.gov/bessd/aabd/"],
  },
  {
    slug: "child-care-subsidy",
    name: "Child Care Subsidy (DHS Child Care Program, including Preschool Open Doors)",
    agency: `${DHS_BESSD}, Child Care Program`,
    officialUrl: "https://humanservices.hawaii.gov/bessd/ccch-subsidies/",
    applyUrl: "https://childcaresubsidyapplication.dhs.hawaii.gov/",
    keywords: "child care daycare preschool working parents families children",
    sources: [
      "https://humanservices.hawaii.gov/bessd/ccch-subsidies/",
      "https://humanservices.hawaii.gov/bessd/files/2026/06/What-are-the-Eligibility-Requirements-for-Child-Care-Subsidy-REV-5-2026.pdf",
    ],
  },
  {
    slug: "med-quest",
    name: "Med-QUEST (Hawaiʻi Medicaid, QUEST Integration)",
    agency: "Hawaiʻi Department of Human Services, Med-QUEST Division",
    officialUrl: "https://medquest.hawaii.gov/",
    applyUrl: "https://medical.mybenefits.hawaii.gov",
    keywords: "health insurance coverage Medicaid medical doctor hospital children pregnant kupuna disabled",
    sources: [
      "https://medquest.hawaii.gov/en/members-applicants/get-started/programs",
      "https://medquest.hawaii.gov/posts/changes-coming-to-med-quest-eligibility-for-adults--",
      "https://medquest.hawaii.gov/en/members-applicants/get-started/how-to-apply",
    ],
  },
  {
    slug: "wic",
    name: "Hawaiʻi WIC (Special Supplemental Nutrition Program for Women, Infants and Children)",
    agency: "Hawaiʻi State Department of Health, WIC Services",
    officialUrl: "https://health.hawaii.gov/wic/",
    applyUrl: "https://health.hawaii.gov/wic/program_details/",
    keywords: "food nutrition pregnant breastfeeding infants babies toddlers children under five",
    sources: [
      "https://health.hawaii.gov/wic/",
      "https://health.hawaii.gov/wic/program_details/",
      "https://health.hawaii.gov/wic/clinic-locations/",
    ],
  },
  {
    slug: "liheap",
    name: "Hawaiʻi Home Energy Assistance Program (H-HEAP, LIHEAP)",
    agency: DHS_BESSD,
    officialUrl: "https://humanservices.hawaii.gov/bessd/liheap/",
    applyUrl: "https://humanservices.hawaii.gov/bessd/files/2026/06/2026-Application-Packet.pdf",
    keywords: "electric bill utility gas energy shutoff disconnection",
    sources: [
      "https://humanservices.hawaii.gov/bessd/liheap/",
      "https://humanservices.hawaii.gov/bessd/files/2026/06/2026-Application-Packet.pdf",
    ],
  },
  {
    slug: "kupuna-care",
    name: "Kūpuna Care",
    agency: "County Area Agencies on Aging (on Oʻahu, the City and County of Honolulu Elderly Affairs Division)",
    officialUrl: "https://elderlyaffairs.com/services/eligibility-requirements/",
    keywords: "kupuna kūpuna seniors elderly aging in-home care adult day care caregiver long-term care",
    sources: [
      "https://elderlyaffairs.com/services/eligibility-requirements/",
      "https://elderlyaffairs.com/common-questions/",
      "https://www.hawaiiadrc.org/",
    ],
  },
  {
    slug: "section-8-hcv",
    name: "Section 8 Housing Choice Voucher (HCV) Program",
    agency: "Hawaiʻi Public Housing Authority and county public housing agencies",
    officialUrl: "https://www.hpha.hawaii.gov/programs-and-resources/voucher-programs",
    keywords: "housing rent rental assistance voucher landlord renters waitlist",
    sources: [
      "https://www.hpha.hawaii.gov/programs-and-resources/voucher-programs",
      "https://www.honolulu.gov/dcs/dcs-cad-section-8/",
      "https://www.housing.hawaiicounty.gov/housing-assistance",
      "https://www.mauicounty.gov/2041/Housing-Choice-Voucher-Section-8-Program",
      "https://www.kauai.gov/Government/Departments-Agencies/Housing-Agency/Section-8-Rental-Assistance",
    ],
  },
  {
    slug: "ssi",
    name: "Supplemental Security Income (SSI)",
    agency: "U.S. Social Security Administration",
    officialUrl: "https://www.ssa.gov/ssi",
    applyUrl: "https://www.ssa.gov/apply/ssi",
    keywords: "cash monthly payments disability blind kupuna seniors 65 low income",
    sources: ["https://www.ssa.gov/ssi", "https://www.ssa.gov/ssi/eligibility", "https://www.ssa.gov/agency/contact/phone.html"],
  },
  {
    slug: "federal-eitc",
    name: "Earned Income Tax Credit (EITC)",
    agency: "Internal Revenue Service (IRS)",
    officialUrl: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc",
    applyUrl:
      "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/how-to-claim-the-earned-income-tax-credit-eitc",
    keywords: "tax credit refund workers wages families children",
    sources: [
      "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/who-qualifies-for-the-earned-income-tax-credit-eitc",
      "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/earned-income-and-earned-income-tax-credit-eitc-tables",
      "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/how-to-claim-the-earned-income-tax-credit-eitc",
      "https://www.irs.gov/help/telephone-assistance",
    ],
  },
  {
    slug: "hawaii-eitc",
    name: "Hawaiʻi Earned Income Tax Credit",
    agency: DOTAX,
    officialUrl: "https://files.hawaii.gov/tax/geninfo/info/Flyer-EITC.pdf",
    applyUrl: "https://files.hawaii.gov/tax/forms/current/n356_i.pdf",
    keywords: "state tax credit refund workers wages families children",
    sources: [
      "https://files.hawaii.gov/tax/geninfo/info/Flyer-EITC.pdf",
      "https://files.hawaii.gov/tax/forms/current/n356_i.pdf",
      "https://tax.hawaii.gov/contact/",
    ],
  },
  {
    slug: "hawaii-food-excise-credit",
    name: "Hawaiʻi Refundable Food/Excise Tax Credit",
    agency: DOTAX,
    officialUrl: "https://files.hawaii.gov/tax/forms/current/n311_i.pdf",
    applyUrl: "https://files.hawaii.gov/tax/forms/current/n311_i.pdf",
    keywords: "state tax credit refund food general excise tax GET low income",
    sources: ["https://files.hawaii.gov/tax/forms/current/n311_i.pdf", "https://tax.hawaii.gov/contact/"],
  },
  {
    slug: "hawaii-low-income-renters-credit",
    name: "Hawaiʻi Credit for Low-Income Household Renters",
    agency: DOTAX,
    officialUrl: "https://files.hawaii.gov/tax/forms/current/schx_i.pdf",
    applyUrl: "https://files.hawaii.gov/tax/forms/current/schx_i.pdf",
    keywords: "state tax credit refund rent renters housing low income kupuna",
    sources: ["https://files.hawaii.gov/tax/forms/current/schx_i.pdf", "https://tax.hawaii.gov/contact/"],
  },
]
