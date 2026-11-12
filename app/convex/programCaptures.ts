/**
 * Saved text of official program pages whose sites refuse automated requests
 * (HTTP 403 to server-side fetches), keyed by URL. Copied from the page as
 * displayed in a browser on `capturedAt`; site navigation menus are left out.
 * programs:refresh tries a live fetch first and falls back to these.
 * Re-capture a page when its program changes, and update `capturedAt`.
 */
export const PROGRAM_CAPTURES: Readonly<Record<string, { capturedAt: string; text: string }>> = {
  "https://www.ssa.gov/ssi": {
    capturedAt: "2026-11-11",
    text: `Supplemental Security Income (SSI)

SSI provides monthly payments to people with disabilities and older adults who have little or no income or resources.

Learn how to apply

Who can get SSI
Adults and children might be eligible for SSI if they have:
Little or no income, and
Little or no resources, and
A disability, blindness, or are age 65 or older.

How much you could get
Your monthly payment depends on your income, living situation, things you own, and other factors.

Report changes to your income, resources, and living situation
Each month, you must report your wages, other income, and changes to your resources or living arrangements.

Programs to get more help while on SSI
Explore programs, like the Supplemental Nutrition Assistance Program (SNAP) and Medicaid, that help you save money and take care of basic needs while on SSI.`,
  },

  "https://www.ssa.gov/ssi/eligibility": {
    capturedAt: "2026-11-11",
    text: `Who can get SSI

Adults and children might be eligible for SSI if they have:
Little or no income, and
Little or no resources, and
A disability, blindness, or are age 65 or older.

1. You have little or no income (like wages and Social Security benefits)
SSI is generally for individuals who don't earn more than $2,073 from work each month. The income limit increases for couples and when parents apply for children. We also look at other sources of income besides your job, like disability benefits, unemployment, and pensions.

2. You have little or no resources (things you own)
Common resources are vehicles and money in bank accounts. Your resources should not be more than:
$2,000 for individuals
$3,000 for couples
If you're a parent applying for a child, these numbers increase by $2,000.

3. You have a disability or are age 65 or older
If you're age 64 or younger, you must have a disability that:
Affects your ability to work for a year or more, or
Will result in death, or
Severely limits daily activity (for children with disabilities).
If you have a disability, you'll also need to prove you've earned less than $1,690 from work per month in the month you're applying. Citizens ages 65 or older don't need to have a disability to get SSI.

Additional rules for noncitizens
There are other qualifications for noncitizens besides income, resources, and age or disability.`,
  },

  "https://medquest.hawaii.gov/en/members-applicants/get-started/programs": {
    capturedAt: "2026-11-11",
    text: `Medicaid Programs

Your caseworker will help you find the Medicaid programs that fit your personal situation.

QUEST Integration covers the following groups:

Adults: Provides Medicaid eligibility for individuals age nineteen years or older and under age sixty-five years.

Children: Provides Medicaid eligibility for infants and children under age nineteen, or under age twenty one years old and in receipt of foster care, kinship guardianship, or adoption assistance.

Former Foster Care Children: Provides Medicaid eligibility for certain former beneficiaries of foster care, kinship guardianship, or adoption assistance who are age eighteen years but under age twenty-six years old.

Parent and Other Caretaker Relatives: Provides Medicaid eligibility for a parent or other caretaker relative living with a child under age nineteen years.

Pregnant Women: Provides Medicaid eligibility for pregnant women to include a pregnant individual under age nineteen years, whose household income exceeds the age-specific income standard for a household of applicable size for participation under Title XIX of the Social Security Act, or under age twenty-one years and in receipt of foster care, kinship guardianship, or adoption assistance.

Transitional Medical Assistance: Provides Medicaid eligibility provisions of transitional medical assistance for a pregnant woman, or parent or caretaker relative, to include a qualified non-citizen, living with a child under age nineteen or an individual who is under age twenty-one and in receipt of foster care, kinship guardianship or adoption assistance, who becomes ineligible for medical assistance as a result of increased earned income, or collection or increased collection of spousal support payments under section 1925 of the Social Security Act.

Aged, Blind, and Disabled: Provides Medicaid eligibility for aged, blind, and disabled individuals under the provisions of Title XIX of the Social Security Act.

Medically Needed Spenddown Program: Provides Medicaid eligibility for children under age nineteen years, pregnant women, and aged, blind, or disabled individual with incurred medical expenses to qualify for medical assistance who are ineligible to participate in a coverage group established under the provisions of Affordable Care Act of 2010, or the mandatory or optionally categorically needy coverage group under Title XIX of the Social Security Act.

Emergency Medical Assistance for Non-Citizens: Provides Medicaid eligibility for children under age nineteen years, pregnant women, and aged, blind, or disabled individual with incurred medical expenses to qualify for medical assistance who are ineligible to participate in a coverage group established under the provisions of Affordable Care Act of 2010, or the mandatory or optionally categorically needy coverage group under Title XIX of the Social Security Act.

Special Medical Assistance Coverage and Programs
Hawaii offers the following Medicare Savings Programs that can help with some of your Medicare costs: QMB – Qualified Medicaid Beneficiaries; SLMB – Specified Low Income Medicare Beneficiaries; QDWI – Qualified Disabled and Working Individuals; QI – Qualifying Individuals.
QSII – Qualified Severely Impaired Individuals: Provide Medicaid eligible coverage for individuals qualified severely impaired criteria.
Medical Assistance for Disabled Adult Children Who Lose SSI Benefits: Provides Medicaid eligible coverage for disabled adults who are receiving OASDI benefits as a dependent adult child.
Medical Payment For Pensioners: Provides Medicaid eligibility coverage for pensioners.

Premium Assistance Program: Subject to the availability of State funds, a premium assistance program for a low-income individual who purchases a silver level qualified health plan through the Hawaii health insurance exchange and receives advanced premium tax credit (APTC) and maximum cost-sharing reduction (CSR). The department shall pay the eligible individual's share of the premium to the qualified health plan in which the eligible individual is enrolled.

Breast and Cervical Cancer Program
Federal Funded Coverage: Establish coverage for an individual who is eligible for the Centers for Disease Control and Prevention (CDC) breast and cervical cancer early detection program (BCCEDP) and was found through that program to have cancer or a precancerous condition of the breast or cervix, requires treatment, and meets the eligibility requirements of this chapter.
State Funded Coverage: Establishes a State funded medical assistance program for an individual who meets the requirements under the Breast and Cervical Cancer Program except for citizenship status and the eligibility requirements of this chapter.

Refugee Medical Assistance: Provides Medicaid eligibility for participation due to Refugee status.`,
  },

  "https://medquest.hawaii.gov/posts/changes-coming-to-med-quest-eligibility-for-adults--": {
    capturedAt: "2026-11-11",
    text: `Changes coming to Med-QUEST Eligibility for Adults!
Date Published: 04/22/2026. Last Updated: 08/15/2026.

When? Starting on January 1, 2027.

Why? Congress passed a Bill (HR1) that President Trump signed into law on 7/4/25 that is requiring Medicaid programs to change eligibility rules for some adults.

Who? These changes only impact adults between 19-64 who are not Blind, Disabled or Pregnant.

What? There are two new requirements that will start in 2027:
For individuals described above, eligibility renewals will happen every six months instead of once per year.
To keep Med-QUEST coverage, this adult group will need to demonstrate that they are either working or volunteering at least 80 hours per month or earning a minimum of $580 per month or are enrolled at least half-time in an educational program.

How? Set up online access to your existing Med-QUEST account and mybenefits.hawaii.gov. If you work, make sure you save your paystubs. If you don't have a paystub, but have proof of $580 income per month, save that evidence of income. If you are enrolled in an educational program at least half time, ask your school for an official proof of enrollment.`,
  },

  "https://medquest.hawaii.gov/en/members-applicants/get-started/how-to-apply": {
    capturedAt: "2026-11-11",
    text: `Apply for Medicaid

The Med-QUEST Division accepts applications for medical assistance coverage online, over the phone, by mail or Fax. Fill out the application as completely as possible.

You have three ways to apply for a health plan:
Apply Faster Online at https://medical.mybenefits.hawaii.gov
Call Med-QUEST Customer Service: 1-800-316-8005 toll-free. TTY users, call 1-855-889-4325 toll-free or 711.
Fillable PDF Application: print the completed DHS 1100 "Application for Health Coverage and Help Paying Costs" and mail or fax it to the Med-QUEST Division Eligibility Office nearest you.

Additional forms are needed for applicants who need Long Term Care Services (DHS 1100, DHS 1100B, DHS 1167, DHS 1169, DHS 1169A, DHS 8003 and DHS 8004) and for applicants with disability (DHS 1100, DHS 1100B, DHS 1127 and DHS 1128).

Health Plan Enrollment: An eligible individual will receive an enrollment choice packet by mail to select a plan from the available plans in their area. If you're pregnant and enrolled in a QUEST Integration Health Plan on the date you deliver your child, your newborn will automatically be enrolled in your health plan for a minimum of 30 days from the date of birth. If your Medicaid eligibility ends for any reason, your QUEST Integration health plan enrollment will also end. You may reapply at any time.`,
  },

  "https://www.housing.hawaiicounty.gov/housing-assistance": {
    capturedAt: "2026-11-11",
    text: `Housing Assistance (Section 8) — County of Hawaiʻi Office of Housing and Community Development

The County of Hawaiʻi Office of Housing and Community Development (OHCD), Existing Housing Division administers federally funded housing assistance programs through the United States Department of Housing and Urban Development (HUD). These programs are designed for low-income families to find safe and affordable housing in the private market, within the County of Hawaiʻi (Hawaiʻi Island).

Housing Voucher Programs: tenants can typically pay around 30% of their household Adjusted Monthly Income (AMI) towards rent. After OHCD determines family affordability and rent reasonableness, the remaining portion of rent on a monthly basis may be subsidized with rental assistance if individuals and families meet eligibility requirements and if funding is available.

There are 6 different Housing and Rental Assistance Vouchers that OHCD administers:
Housing Choice Voucher (HCV): the federal government's major program for assisting very low-income families, the elderly, and the disabled to afford decent, safe, and sanitary housing in the private market. Participants find their own housing; a housing subsidy is paid to the landlord directly by the PHA and the family pays the tenant rent portion.
Mainstream Vouchers for Non-elderly persons with disabilities (MS).
Project-Based Voucher (PBV).
Foster Youth to Independence Initiative (FYI): for youth at least 18 years and not more than 24 years of age who left foster care, or will leave foster care within 90 days, and are homeless or at risk of becoming homeless; assistance for a maximum of 36 months.
Veterans Affairs Supportive Housing (VASH): HCV rental assistance for homeless Veterans with case management and clinical services.
Stability Voucher (SV): for households experiencing or at risk of homelessness, those fleeing or attempting to flee domestic violence, dating violence, sexual assault, stalking, human trafficking, and veterans and families that include a veteran family member that meets one of the preceding criteria.

Programs for Section 8 participants: Family Self-Sufficiency Program (FSS) and Homeownership Option Program (HOP); contact fsshopinfo@hawaiicounty.gov or (808) 959-4642.`,
  },

  "https://www.mauicounty.gov/2041/Housing-Choice-Voucher-Section-8-Program": {
    capturedAt: "2026-11-11",
    text: `Housing Choice Voucher Section 8 Program — County of Maui, Department of Housing

The Public Housing Administration's mission is to provide safe, decent and sanitary housing conditions for very low-income families and to manage resources efficiently.

Section 8 Waitlist: If you have been selected for placement on the waiting list, your status will say "Active". While you remain on the waiting list, you must immediately inform the County of Maui of changes in contact information, in writing. If you have not been selected for placement on the waiting list, your status will say "Inactive" and you may re-apply again when the waiting list re-opens.

Contact: Section 8 Rental Assistance Program, 2065 Main Street, Suite 108, Wailuku, HI 96793. Phone: (808) 270-7751. Fax: (808) 270-7829.

The purpose of the Housing Choice Voucher program is to provide rental assistance to eligible families. The rules and regulations of the HCV program are determined by the U.S. Department of Housing and Urban Development. When a family is determined to be eligible for the program and funding is available, the PHA issues the family a housing voucher. When the family finds a suitable housing unit and funding is available, the PHA will enter into a contract with the owner and the family will enter into a lease with the owner. Even though the family is determined to be eligible for the program, the owner has the responsibility of approving the family as a suitable renter. Utility allowances apply for Maui, Molokai and Lanai.`,
  },

  "https://www.kauai.gov/Government/Departments-Agencies/Housing-Agency/Section-8-Rental-Assistance": {
    capturedAt: "2026-11-11",
    text: `Section 8 Rental Assistance — Kauaʻi County Housing Agency

New clients who have not yet been assigned to a caseworker may call (808) 241-4440.

Public notice (publish date August 21, 2026): Opening of the Kauai County Housing Agency's Housing Choice Voucher (Section 8) waitlist. The entire application process is available online at https://waitlistcheck.com/HI795 beginning on Tuesday, September 01, 2026, 12:00am (HST) until further notice. Program eligible applicants will be selected from the waiting list based on targeted funding or selection preference(s) for which they qualify. Within each category, applications will be selected on a first come, first serve basis. Only one application will be allowed per household. There is no guarantee for eligibility or rental payment assistance after applying. There is no cost to apply to the Wait list. Acceptance and/or assistance are based on income verification and eligibility requirements.

2026 Applicable Income Limits (maximum income by number of household members): 1 person $47,600; 2 persons $54,400; 3 persons $61,200; 4 persons $67,950; 5 persons $73,400; 6 persons $78,850; 7 persons $84,300; 8 persons $89,700.

If computer access is unavailable, application may be completed using the kiosk in the Housing Agency lobby; call at least 2 days ahead to schedule assistance.

Press release, September 24, 2026: Section 8 housing assistance payments to landlords may be delayed due to the effects of Hurricane Lowell and the Sept. 9 fire at the Kapule Building at the Līhuʻe Civic Center. Participants are not responsible for the housing authority's portion of rent and cannot be evicted or penalized for these payment delays; they must continue to pay their tenant portion.

The HUD Housing Choice Voucher Program is the federal government's major program for assisting very low-income families, the elderly, and people with disabilities to afford decent, safe, and sanitary housing in the private market. A housing subsidy is paid to the landlord directly by the PHA on behalf of the participating family. Contact: County of Kauai Housing Agency, 4444 Rice Street, Suite 330, Lihue, HI 96766, (808) 241-4440.`,
  },
}
