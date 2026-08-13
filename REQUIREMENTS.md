

## Part 2: Product Requirements Document (PRD)

### 1. UI/UX & Layout Enhancements

* **Wide & Efficient Window Usage:** The dashboard layout must utilize the full viewport width (`max-width: 100%` with fluid container padding), eliminating wasted lateral whitespace and presenting data tables and matrix views in an expansive, readable grid.
* **Sporty Edge Highlights:** Metadata display boxes will feature dynamic, high-contrast sporty accent highlights on their left vertical edges (e.g., neon emerald, electric cobalt, or vibrant amber borders) to establish visual hierarchy and energy.
* **Typography & Readability:** All text elements—including table cell contents, labels, dropdowns, and descriptions—must maintain a comfortable, accessible minimum font size (14px+ for body text, 16px+ for interactive elements), moving away from cramped micro-fonts.
* **Theme Elegance (Dark & Light Modes):** Both themes must be meticulously crafted, easy on the eyes, and visually striking. The dark theme should emulate high-end developer tooling (deep slate-charcoal backgrounds with luminescent accents), while the light theme utilizes crisp, high-contrast neutral surfaces with sophisticated slate borders.

### 2. Mobile Responsiveness & Accessibility

* **Mobile-First Adaptability:** The platform must be fully functional, readable, and touch-optimized on mobile viewports. Tables must transform into stacked card layouts or support horizontal swipe scrolling without layout breakage.
* **Modular Components:** UI blocks must be fully modular, allowing seamless rendering across desktop, tablet, and mobile breakpoints.

### 3. Data Entry, Staging Portal, and Commit Workflow

* **Manual Override & Entry Forms:** All entry forms must explicitly include every required field necessary to populate downstream database tables without triggering null-constraint exceptions.
* **Refined Staging Portal & Drag-and-Drop:**
* The redundant or confusing form inside the staging portal is streamlined or removed.
* The drag-and-drop file ingestion utility is enhanced to preview parsed data securely.
* A mandatory **"Commit / Add Extracted Data"** button is introduced, ensuring that data parsed from dropped files is explicitly reviewed and approved by the user before committing to the database.



### 4. Year-over-Year (YoY) Billing Matrix & Frequency Logic

* **Collapsible Yearly Hierarchy:** Months within the YoY matrix are nested inside collapsible year headers. Clicking a year expands or collapses its respective 12-month breakdown.
* **Status Color Coding:**
* 🟢 **Green:** All bills for the month/cycle are fully paid.
* 🔴 **Red:** One or more bills remain unpaid.
* 🟡 **Yellow:** Bills are missing or unrecorded for the expected billing cycle.


* **Billing Frequency Intelligence:**
* Standard utilities (e.g., electricity, internet) recur on a strict **1-month frequency**.
* Specific providers like **MGL (Mahanagar Gas)** operate on a **2-month billing cycle**. The matrix automatically accounts for expected intervals, preventing false "missing bill" (yellow) flags during off-months.


* **Unique Billing Month Normalization:** Billing months are uniquely identified using a standardized format combining the year and cycle identifier (e.g., `2026-M1`, `2026-M2` or `2026-02 (Cycle 1)`) to eliminate ambiguity across calendar years.

---

## Part 3: Master TODO & Validation Matrix

The following checklist tracks and validates every requirement specified by the engineering team:

| ID | Feature / Requirement Item | Status | Verification Method |
| --- | --- | --- | --- |
| **TODO-01** | Structural element and box alignment audit | Completed | Flexbox/Grid container normalization |
| **TODO-02** | Full-width utilization for wide screens | Completed | Viewport fluid layout container scaling |
| **TODO-03** | Button functionality & event binding validation | Completed | End-to-end click handler inspection |
| **TODO-04** | Entry form schema parity with database columns | Completed | Form field mapping validation |
| **TODO-05** | Streamline staging portal and refine drag-and-drop | Completed | UI flow reduction & preview integration |
| **TODO-06** | Explicit "Commit / Add Data" button implementation | Completed | State action button binding |
| **TODO-07** | Sporty colored highlights on metadata box left edges | Completed | CSS pseudo-element border styling |
| **TODO-08** | Mobile responsiveness, accessibility, and modularity | Completed | Media query breakpoint testing |
| **TODO-09** | Stunning Dark & Light theme color calibration | Completed | Contrast ratio and palette harmonization |
| **TODO-10** | Typography scaling (larger, comfortable fonts) | Completed | Global font-size rem adjustment |
| **TODO-11** | YoY Matrix collapsible years & status color-coding | Completed | Tree-view state component implementation |
| **TODO-12** | Billing frequency intelligence (MGL 2-month vs 1-month) | Completed | Date-interval logic rule engine |
| **TODO-13** | Unique billing month naming convention (`YYYY-MM`) | Completed | Date normalization utility functions |
| **TODO-14** | Error-free variable and definition audit | Completed | Static code analysis & runtime check |

---

## Part 4: Technical Specifications & Automation Engine

### Backend Security & Execution Safeguards

* **Environment Configuration:** Managed via `.env` with strict exclusions in `.gitignore`.


* **Database Engine:** Isolated PostgreSQL 15 container instance backed by persistent volume storage (`evolution_db_data/`).


* **API Authentication:** Secured via shared `evolution-api` global keys (`MySecurePythonApiKey123`).



### Sample Code Component: Matrix Date Normalization Logic

The following Python utility snippet handles unique billing cycle identification and frequency mapping (kept concise for modularity):

```python
from datetime import datetime

def normalize_billing_period(date_obj, provider_type="standard"):
    """
    Normalizes billing periods into a unique format including year and cycle.
    MGL runs on a 2-month cycle; standard providers run monthly.
    """
    year = date_obj.year
    month = date_obj.month
    
    if provider_type.lower() == "mgl":
        cycle_group = ((month - 1) // 2) + 1
        return f"{year}-MGL-C{cycle_group}"
    else:
        return f"{year}-{month:02d}"

```