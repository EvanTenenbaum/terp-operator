# Odoo Community Edition 18.0 — Codebase Structure & Engineering Practices Report

**Source:** https://github.com/odoo/odoo (branch `18.0`)  
**Date:** 2026-06-18  
**Scope:** Top-level structure, module anatomy, testing, code organization, config, dependencies, docs, CI/CD

---

## 1. Directory Structure

### Top-Level Layout

```
odoo/                    # Framework core (ORM, HTTP, CLI, tools, base addons)
addons/                  # Business modules (~350+ addons: account, sale, crm, etc.)
odoo-bin                 # CLI entry point (python3 → odoo.cli.main())
setup.py                 # setuptools packaging
requirements.txt         # Pinned production dependencies
setup.cfg                # Minimal setuptools config
MANIFEST.in              # Package manifest
README.md                # Minimal; links to external docs
CONTRIBUTING.md          # Links to wiki contribution guidelines
SECURITY.md              # Responsible disclosure policy
LICENSE / COPYRIGHT      # LGPL-3 / proprietary dual-license
.deb packaging/
doc/                     # CLA signatures only
.github/                 # Issue templates, PR template (NO GitHub Actions)
```

### `odoo/` — Framework Core

| Path | Purpose |
|------|---------|
| `odoo/api.py` | ORM API decorators (`@api.model`, `@api.depends`, `@api.onchange`, etc.) — 63KB |
| `odoo/fields.py` | Field type definitions (`Char`, `Integer`, `Many2one`, etc.) — 239KB |
| `odoo/models.py` | Base `Model` class, CRUD, search, browse, inheritance — 341KB |
| `odoo/http.py` | HTTP request/response handling, routing, controllers — 102KB |
| `odoo/sql_db.py` | PostgreSQL connection pool & cursor management |
| `odoo/netsvc.py` | Logging & service infrastructure |
| `odoo/modules/` | Module loading, dependency resolution, migration hooks |
| `odoo/tools/` | Utilities (mail, image, PDF, translation, profiling, etc.) |
| `odoo/tests/` | **Test framework** (see §3) |
| `odoo/cli/` | Command-line interface commands |
| `odoo/service/` | WSGI server, cron runner, common services |
| `odoo/addons/` | **Base addons** (`base`, `test_*` framework validation modules) |
| `odoo/upgrade/` | Database upgrade scripts |
| `odoo/upgrade_code/` | Code transformation utilities for upgrades |
| `odoo/conf/` | Configuration file parsing |
| `odoo/osv/` | Legacy ORM wrappers (kept for compatibility) |
| `odoo/_monkeypatches/` | Runtime patches to stdlib/third-party libs |

### `addons/` — Business Modules

Hundreds of modules organized by domain. Naming is functional/snake_case:

- `account*`, `analytic`, `auth_*` — Finance & Auth
- `sale*`, `purchase*`, `stock*`, `mrp*` — Operations
- `crm`, `project`, `event`, `survey` — Productivity
- `website*`, `web*`, `mail`, `portal` — Platform
- `payment*`, `delivery*`, `l10n_*` — Integrations & Localizations

---

## 2. Module / Addon Structure

### Required Files

Every module **must** have:

1. **`__manifest__.py`** — Module metadata (replaced legacy `__openerp__.py`)
2. **`__init__.py`** — Python package init, imports `models/`, `controllers/`, etc.

### Standard Internal Directory Layout

Using `addons/sale/` as the canonical example:

```
sale/
├── __manifest__.py          # Metadata, dependencies, data files, asset bundles
├── __init__.py              # Imports models, controllers, wizard, report
├── README.md                # Module-level docs (optional but common)
├── models/                  # Business logic / ORM models
│   ├── __init__.py
│   ├── sale_order.py        # ~98KB — main model
│   ├── sale_order_line.py   # ~77KB
│   ├── account_move.py
│   ├── product_template.py
│   ├── res_partner.py
│   └── ... (18 model files total)
├── controllers/             # HTTP routes (portal, public endpoints)
├── views/                   # XML view definitions (forms, trees, kanban, actions, menus)
├── data/                    # Demo & production data (cron, sequences, mail templates)
├── demo/                    # Demo records loaded on "Load demo data"
├── security/                # Access control
│   ├── ir.model.access.csv  # CRUD permissions per group
│   ├── ir_rules.xml         # Record rules
│   └── res_groups.xml       # User groups
├── report/                  # QWeb reports & SQL reporting views
├── wizard/                  # Transient models (pop-ups, multi-step flows)
├── static/                  # Frontend assets
│   ├── src/js/              # OWL / legacy JS components
│   ├── src/scss/            # Styles
│   ├── src/xml/             # OWL templates
│   └── tests/               # JS unit tests & tours
├── tests/                   # Python tests
│   ├── __init__.py
│   ├── common.py            # Shared test fixtures
│   └── test_*.py            # Individual test suites
└── i18n/                    # Translation `.po` files
```

### Manifest Example (`addons/sale/__manifest__.py`)

Key fields observed:

| Field | Purpose |
|-------|---------|
| `name`, `version`, `category`, `summary`, `description` | Metadata |
| `depends` | Dependency graph (e.g., `['sales_team', 'account_payment', 'utm']`) |
| `data` | XML/CSV files loaded at install (order matters) |
| `demo` | Demo data files |
| `assets` | JS/CSS bundle declarations for `web.assets_backend`, `web.assets_frontend`, `web.assets_tests`, `web.assets_unit_tests`, `web.report_assets_common` |
| `post_init_hook` | Python callable run after install |
| `installable` | Boolean visibility |
| `license` | `'LGPL-3'` for CE modules |

### Naming Conventions

- **Module names**: `snake_case`, functional (e.g., `account_edi_ubl_cii_tax_extension`)
- **Model files**: One file per primary model or cohesive group (e.g., `sale_order.py`, `account_move.py`)
- **Model classes**: `CamelCase` inheriting from `models.Model`
- **XML view files**: `model_name_views.xml` or `feature_views.xml`
- **Test files**: `test_*.py` (unittest discovery pattern)
- **Security files**: `ir.model.access.csv`, `ir_rules.xml`, `res_groups.xml`

---

## 3. Testing

### Where Tests Live

| Location | Purpose |
|----------|---------|
| `odoo/tests/` | **Framework test infrastructure** (not app tests) |
| `odoo/addons/test_*` | **Framework validation modules** (~20 modules testing ORM, HTTP, RPC, assets, translations, etc.) |
| `addons/<module>/tests/` | **Module-specific tests** |

### Framework Test Infrastructure (`odoo/tests/`)

| File | Role |
|------|------|
| `common.py` (111KB) | Base classes: `BaseCase`, `TransactionCase`, `SingleTransactionCase`, `SavepointCase`, `HttpCase`, `ChromeBrowser`, form simulation, mock server |
| `case.py` | Test case mixins, environment management |
| `suite.py` | Custom test suite & runner integration |
| `loader.py` | Test discovery & module loading |
| `form.py` (41KB) | `Form` helper — simulate UI onchange/compute flows in Python |
| `result.py` | Custom test result formatter |
| `tag_selector.py` | Tag-based test filtering (`@tagged('post_install', '-standard')`) |
| `test_module_operations.py` | Install/uninstall validation |

### Testing Framework

- **Base**: Python standard `unittest`
- **Odoo extensions**: `TransactionCase` (each test in own DB transaction, rolled back), `SavepointCase` (faster, uses savepoints), `HttpCase` (full HTTP + headless Chrome for e2e), `SingleTransactionCase`
- **Test tags**: `@tagged('at_install', 'post_install')` control when tests run relative to module installation
- **JS testing**: 
  - **QUnit** for unit tests (`web.qunit_suite_tests` bundle)
  - **Tours** (`web.assets_tests`) — scripted browser automation for UI flows
  - **Mock server tests** (`web.assets_unit_tests`) — isolated frontend logic

### Test:Source Ratio (Module Example: `sale`)

| Metric | Count |
|--------|-------|
| Model files (`models/`) | 18 |
| Test files (`tests/`) | 29 (`test_*.py`) + `common.py` + `product_configurator_common.py` |
| Test LOC (sample) | `test_sale_order.py` = 52KB, `test_sale_to_invoice.py` = 67KB |
| Source LOC (sample) | `sale_order.py` = 98KB, `sale_order_line.py` = 77KB |

**Observation**: Test *file* count exceeds model file count (~1.6:1). Test code volume is substantial, often approaching or exceeding source volume for complex modules. This indicates a **heavy integration-testing philosophy** — tests exercise full ORM transactions, onchange chains, and multi-model workflows rather than isolated unit tests.

### Testing Philosophy

1. **Database-integration first**: Tests run against a real PostgreSQL database with Odoo ORM. Mocking is rare; fixtures populate actual records.
2. **Transaction isolation**: Each test method rolls back the DB cursor, ensuring clean state.
3. **Form simulation**: `Form` class lets tests trigger `onchange`, `compute`, and constraint logic exactly as the UI would.
4. **Tour / e2e tests**: Critical user flows (checkout, invoice creation) are validated via headless Chrome automation.
5. **At-install vs post-install**: Tests can run immediately after module install (`at_install`) or after all modules are loaded (`post_install`) to catch cross-module interaction bugs.

---

## 4. Code Organization

### Separation of Concerns

| Concern | Location | Notes |
|---------|----------|-------|
| **ORM Models / Business Logic** | `models/*.py` | Core domain logic, fields, constraints, compute methods, workflows |
| **Views / UI Definition** | `views/*.xml` | Declarative XML: forms, trees, kanban, search, actions, menus |
| **Controllers / HTTP** | `controllers/*.py` | `@route()` decorated classes; handles web requests, portal, API |
| **Reports** | `report/*.py`, `report/*.xml` | QWeb PDF templates & SQL reporting views |
| **Wizards** | `wizard/*.py`, `wizard/*.xml` | Transient models for multi-step user interactions |
| **Security** | `security/` | Access rights (`ir.model.access.csv`), record rules (`ir_rules.xml`), groups |
| **Data** | `data/`, `demo/` | Immutable reference data, cron jobs, sequences, email templates |
| **Frontend Assets** | `static/src/*` | OWL components, SCSS, XML templates, legacy widgets |
| **Tests** | `tests/*.py`, `static/tests/*` | Python integration tests, JS unit/tour tests |

### File Naming Conventions

- **Models**: Named after the primary model inside. If a file extends `res.partner`, it may be named `res_partner.py`.
- **Views**: Plural (`sale_order_views.xml`), grouped by model or feature.
- **Menus**: Typically a single `*_menus.xml` file loaded **last** in the manifest `data` list because it references actions defined earlier.
- **Data load order**: The `data` array in `__manifest__.py` is **sequential** — security must load before views, views before menus.
- **Snake_case everywhere** for filenames; `CamelCase` for Python classes.

---

## 5. Configuration

### Root Config Files

| File | Purpose |
|------|---------|
| `setup.py` | setuptools metadata; declares `install_requires` (unpinned/minimum versions) |
| `setup.cfg` | Build config (339 bytes, minimal) |
| `requirements.txt` | **Production reference** — heavily pinned, OS-conditional, Python-version-conditional |
| `MANIFEST.in` | Includes package data in sdist |
| `odoo-bin` | CLI executable — sets `TZ=UTC` then calls `odoo.cli.main()` |
| `.gitignore` | Standard Python/IDE ignores |
| `.weblate.json` | Translation platform configuration (130KB) |

### Runtime Configuration

- Odoo uses **INI-style config files** (`.odoorc` or `odoo.conf`) parsed via `odoo/conf/`.
- Configurable via CLI flags (`--database`, `--addons-path`, `--workers`, etc.).
- No `.env` file convention; environment variables are supported but config file is canonical.
- The `debian/` directory contains packaging scripts for Debian/Ubuntu deployments.

---

## 6. Dependency Management

### Python Dependencies

**Two-tier strategy:**

1. **`setup.py`** — Declares *minimum* versions and broad compatibility:
   - Examples: `'babel >= 1.0'`, `'psycopg2 >= 2.2'`, `'pyusb >= 1.0.0b1'`
   - `python_requires='>=3.10'`
   - Extras: `ldap` → `python-ldap`
   - Tests: `freezegun`

2. **`requirements.txt`** — **Strictly pinned** to OS distribution packages:
   - Version pins vary by **Python version** and **OS** (Ubuntu/Debian codenames: Jammy, Bookworm, Noble, Trixie, Resolute).
   - Examples:
     ```
     Babel==2.9.1 ; python_version < '3.11'
     Babel==2.10.3 ; python_version >= '3.11' and python_version < '3.13'
     Babel==2.17.0 ; python_version >= '3.13'
     ```
   - Comments reference upstream distro versions (e.g., `# (Jammy)`, `# (Noble)`).
   - Security rationale explicitly noted: `# min 41.0.7, pinning 42.0.8 for security fixes`

**Total Python deps**: ~40 core packages (Babel, Jinja2, lxml, Pillow, psycopg2, reportlab, requests, Werkzeug, zeep, etc.)

### JavaScript Dependencies

- **No `package.json`** at the module or repo root for business addons.
- Odoo uses a **custom asset bundling system** declared in `__manifest__.py` under `assets`.
- JS libraries are either:
  - Vendored in `web/static/lib/` (jQuery, Underscore, Bootstrap, etc.)
  - Part of the Odoo OWL framework (modern frontend)
  - Loaded via the module's `static/src/js/` directories
- Minification: `rjsmin` (Python) for JS bundling.

### Dependency Philosophy

- **Conservative**: Pin to known-good distro versions to avoid supply-chain drift.
- **OS-coupled**: Treats Ubuntu LTS as the primary deployment target.
- **Minimal ranges in setup.py, exact pins in requirements.txt** — production installs use `requirements.txt`.

---

## 7. Documentation

### In-Repository Docs

| Location | Content |
|----------|---------|
| `README.md` | Minimal project overview; badges for Runbot, docs, help, nightly builds |
| `CONTRIBUTING.md` | Brief; delegates to GitHub wiki: `github.com/odoo/odoo/wiki/Contributing` |
| `SECURITY.md` | Responsible disclosure instructions |
| `doc/cla/` | Contributor License Agreement signatures |

### External Documentation

- **Primary docs**: `https://www.odoo.com/documentation/18.0/` — hosted externally, not in repo.
- **Developer tutorials**: `developer/howtos.html` (extensive how-to guides covering ORM, views, controllers, security, etc.)
- **User docs**: Application-specific guides (accounting, inventory, POS, etc.)

### Code Comment & Docstring Standard

- **File header**: Every Python file begins with:
  ```python
  # Part of Odoo. See LICENSE file for full copyright and licensing details.
  ```
- **Docstrings**: Used on model classes and significant methods to describe behavior, especially for `compute`, `onchange`, and action methods.
- **Inline comments**: Moderate; complex business logic (tax computation, inventory valuation) is heavily commented.
- **No type hints**: Odoo 18.0 codebase does **not** use Python type annotations in models.
- **No pydoc/sphinx**: Documentation is narrative (external RST), not auto-generated from docstrings.

---

## 8. CI/CD

### What They Use

- **No GitHub Actions** — `.github/workflows/` does not exist.
- **Runbot** (`runbot.odoo.com`) — Odoo's proprietary/custom CI infrastructure.
- Badge in README: `https://runbot.odoo.com/runbot/badge/flat/1/master.svg`

### GitHub Repository Configuration

| Feature | Usage |
|---------|-------|
| `.github/ISSUE_TEMPLATE/` | Issue templates for bug reports |
| `.github/PULL_REQUEST_TEMPLATE.md` | Minimal PR template (212 bytes) |
| `.github/workflows/` | **Absent** — CI is external |

### PR Checks (Inferred from Runbot + Contribution Guidelines)

Per the wiki contribution guidelines and manifest structure, PRs are validated against:

1. **Full test suite**: All `at_install` and `post_install` tests across modules affected by the change.
2. **Lint checks**: Style compliance (implied by `test_lint` addon in `odoo/addons/test_lint`).
3. **Migration safety**: Changes in stable series must not break existing databases; migration scripts required for schema changes.
4. **CLA check**: Contributor License Agreement must be signed (`doc/cla/`).
5. **Version targeting**: PRs must target the correct branch (`18.0` for stable, `master` for new features).

### Stable Branch Policy

- Strict rules on what can change in stable versions (e.g., `18.0`):
  - No breaking schema changes without migration scripts.
  - No behavioral regression; fixes must be minimal.
  - New features go to `master`, not stable.

---

## Summary of Key Engineering Practices

| Practice | Odoo Approach |
|----------|---------------|
| **Architecture** | Modular monolith — every feature is an addon; framework in `odoo/`, business in `addons/` |
| **ORM** | Custom, mature ORM with decorators (`@api.depends`, `@api.onchange`), not Django/SQLAlchemy |
| **Frontend** | Custom OWL framework + legacy widget system; asset bundles declared in manifest |
| **Testing** | Integration-test heavy; real DB transactions; form simulation; headless Chrome tours |
| **Dependencies** | Conservative pinning to distro packages; two-tier (setup.py ranges / requirements.txt exact) |
| **CI/CD** | Self-hosted Runbot, not GitHub Actions |
| **Config** | INI-style `odoo.conf`; no `.env` convention |
| **I18n** | `.po` files per module; Weblate integration |
| **Security** | `ir.model.access.csv` + record rules + groups; defense-in-depth via ORM layer |
| **Extensibility** | **Module inheritance** is core — models, views, controllers, and data can all be extended by other addons without modifying source |

---

*Report generated from live GitHub API and raw content inspection of `odoo/odoo` branch `18.0`.*
