AGENTS COOKBOOKS

An independent personal educational project by souz4rafael.
Not affiliated with, sponsored by, or endorsed by Microsoft.
Microsoft and other product names and marks belong to their respective owners.

SOURCE VISIBLE, RIGHTS RESERVED
This is not open-source software. Reuse, modification and redistribution of
original project material require prior written permission, except where
applicable law or the GitHub Terms of Service provide otherwise. GitHub viewing
and forking rights remain unchanged. See LICENSE.txt before copying this project.

Explore three product-inspired learning experiences:
- Copilot Studio: 28 recipes with editable fictional inputs and local evaluation.
  Four are the original public-service exercises. Twenty form ten public-sector
  journeys, with a service guide and an operational exercise for each journey.
  Four are teaching adaptations of Copilot Studio Gallery samples: Contract
  Compliance Reviewer, AI Use Case Prioritization, Accountant Document Intake
  & Q&A, and IT Service Desk Assistant. Find them under Explore business scenarios.
  Open Preview > Guided conversations to try their scripted dialogue.
- Copilot: a scripted chat playground and the RLE Starter agent-builder recipe.
- Microsoft Foundry: an agent catalog, manifest details and local named drafts.

These are simulations, not Microsoft product portals or production agents.
No live AI, Microsoft 365 connection, Azure deployment, contact form, email
service or application analytics is included. Use fictional data only.
Progress and draft content are saved in your browser, not sent to this project.
GitHub Pages itself processes visitor requests under GitHub's privacy policy.
Some visual resources load from Microsoft-hosted URLs; external links and assets
are subject to their hosts' policies.

PUBLIC SITE
https://souz4rafael.github.io/agent-cookbook/

RUN LOCALLY
Use Node.js 24 LTS (minimum 22.18) and npm.
  npm ci
  npm run build:collection
  npm run preview:collection
Open http://127.0.0.1:4197

Individual development servers:
  npm run dev            Copilot Studio, port 4192
  npm run dev:copilot    Copilot, port 4196
  npm run dev:foundry    Foundry, port 4198
The collection's All cookbooks links appear only in its combined build.

CREATE RECIPES WITH SCOUT, COWORK OR ANOTHER ASSISTANT
For maintainers and contributors with the owner's permission: start by giving
your assistant authoring/recipe-author.txt and access to this
checkout. It is a portable prompt/resource pack, not a native Cowork plugin.
  npm run recipes:author -- list
  npm run recipes:author -- scaffold studio my-recipe citizen-qa
  npm run recipes:author -- check studio recipe-drafts/studio
  npm run recipes:pack

Scaffolds stay in ignored recipe-drafts/ and never publish automatically.
Rewrite cloned examples for your scenario, keep all data fictional, and submit
reviewed changes through a pull request. Studio, Copilot and Foundry have different
contracts and runtime capabilities; consult the instructions before authoring.
Generated JSON Schemas omit some runtime refinements: repository validation is
authoritative. The generated resource pack is in dist-authoring/ and is also a
workflow artifact. It is not included in the learner-facing Pages artifact.

SOURCE MAP
  recipes/                     Studio YAML packages and fictional documents
  copilot/recipes/             Copilot builder JSON packages
  foundry/recipes/             Foundry JSON manifests
  src/                         Product UI and deterministic learning frameworks
  hub/                         Shared landing page
  authoring/                   Portable author instructions
  scripts/ and tests/          Compilation, validation, packaging and tests

PUBLICATION
GitHub Actions validates changes and publishes only dist-collection/ from main.
GitHub Pages must use GitHub Actions as its publishing source.
Pull requests run validation but do not deploy. The site uses relative asset
paths and hash routing, supporting the /agent-cookbook/ project prefix.
There is no backend, admin portal, cloud configuration or private preview in this
public repository. Missing admin paths are simply missing files, not login gates.
Do not add secrets, customer data, personal screenshots or real contact records.

RIGHTS AND ATTRIBUTION
See THIRD-PARTY-NOTICES.txt and the asset provenance files. Public availability
does not grant a blanket license to third-party text, marks, icons or imagery.
Original project material is subject to LICENSE.txt. Third-party components
retain their own terms; the reserved-rights notice does not override them.
