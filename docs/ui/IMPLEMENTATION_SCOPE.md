# Modular UI implementation scope

This branch intentionally limits itself to shared frontend architecture and mobile hierarchy.

## Included

- compile-time module registry;
- registry-driven public pageant navigation;
- modular Manage navigation and deep-linkable workspaces;
- shared organization/pageant context presentation;
- responsive PageHeader, Notice, and Toast primitives;
- UI-kit fields that can participate correctly in grid layouts;
- mobile drawer and bottom-navigation hierarchy;
- UI-kit adoption for Account and first-administrator Setup;
- frontend audit, usage rules, automated source guard, and human acceptance checklist.

## Excluded

- real R2 Media Library and browser upload implementation;
- voting management workflow;
- ticket management workflow;
- prediction-market governance workflow;
- collectible catalogue and mint management workflow;
- business API changes;
- database migrations;
- contract changes;
- deployment-secret provisioning.

The excluded modules are registered so their owning milestones can mount complete workflows without rewriting the shared shell.
