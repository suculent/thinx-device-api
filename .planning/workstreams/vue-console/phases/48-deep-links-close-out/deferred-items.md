## Deferred Items

- Stale "enters through the dashboard" comments in `vue/cypress/integration/history.spec.js` (lines 27-28, 117) and `vue/cypress/integration/device-detail.spec.js` (lines 30-32)
  status: acknowledged
  **What:** since 48-01 (`d80d148`) `cy.visitAppRoute` is a plain hard load, so these comments describe a hop that no longer happens. 48-01 may not edit specs other than `deep-link.spec.js` and `support/session.js`; 48-05 owns the full Cypress suite and can drop them when it touches those specs.
