# Pernova · Supply Chain Disruption Manager

Une control tower pour **anticiper une perturbation, orchestrer des agents et garder
le contrôle de chaque décision**. Démonstration destinée aux CDO, CIO, CISO et Tech Leads :
valeur métier, approbation humaine, gouvernance des modèles et outils MCP, traçabilité,
knowledge base et pilotage des coûts.

## Démarrer la démonstration

Prérequis : **Node.js 24 LTS**, **Python 3.13**, **uv** et npm. Les dépendances sont
verrouillées et restaurées exclusivement depuis les feeds Microsoft CFS :
[standard package-feeds](https://github.com/frkim/ai-coding-standards/blob/main/standards/development/package-feeds.md).
Les configurations `.npmrc`, `pip.conf` et le projet uv font partie du dépôt.

```powershell
npm ci
npm run setup
npm run dev
```

Ouvrir **http://127.0.0.1:5173**. L'API est disponible sur
http://127.0.0.1:8000 et sa documentation sur http://127.0.0.1:8000/api/docs.
Attendre le message `Application startup complete` côté API avant le premier chargement.
Lancer une analyse nominale, explorer les traces, comparer les scénarios puis
approuver ou refuser le transfert synthétique. Les variantes de démonstration
permettent d'observer les refus de politique et la suspension d'un agent.

Le mode local ne nécessite **aucun abonnement Azure, secret, appel LLM payant,
accès SAP ou tenant Agent 365**. Les données métier, réponses agentiques et coûts
du mode local sont synthétiques. Les garde-fous, autorisations, calculs,
approbations, journal persistant et traces sont exécutés par l'application.
Un état « configuré » ne signifie jamais qu'une connexion cloud a été vérifiée.

## Fonctions

| Surface | Expérience |
| --- | --- |
| Control Tower | Incident logistique, flux de traitement et impact métier |
| Agents et traces | Analyses parallèles, appels d'outils et arbre de spans corrélés |
| Comparaison | Critères pondérés, contraintes de stock et décision humaine |
| Gouvernance | Catalogue agents/modèles, politique MCP, kill switch et intégrations |
| Knowledge | Recherche documentaire, classification et citations de sources |
| FinOps | Tokens, coûts estimés, budget et décisions de contrôle |
| Audit | Export JSON des preuves d'une exécution et de sa décision |

La gouvernance Azure cible **Microsoft Foundry (new), Azure API Management,
Application Insights/Azure Monitor et Agent 365**. Les fonctionnalités dépendantes
du tenant, l'authentification entreprise et les contrôles de conformité doivent
être configurés et vérifiés avant une utilisation réelle. Cette application
ne fournit **ni certification de conformité ni système de planification de production**.

## Vérifier

```powershell
npm run lint
npm run build
npm test
npx --no-install playwright install chromium
npm run test:e2e
```

`npm run check:feeds` vérifie les sources des deux lockfiles npm et du lockfile
Python ; CI exécute également ce contrôle. Après une mise à jour des dépendances npm,
`npm run feeds:normalize` remplace uniquement les URLs du backing feed CFS connu
par celles du proxy Microsoft, sans changer les versions ni les intégrités.
Le lockfile Python conserve les téléchargements Azure Artifacts explicitement
annoncés par l'index CFS ; ce backing feed exact est contrôlé, pas des miroirs arbitraires.
Le navigateur Chromium est un runtime
de test téléchargé par Playwright, pas une dépendance récupérée depuis un feed npm.

## Organisation

```text
backend/         API FastAPI, orchestration, politiques, données synthétiques, tests
frontend/        Control tower React / TypeScript / Material UI
infra/           Infrastructure et politiques Azure API Management
docs/            Architecture, limites, gouvernance et guide de démonstration
tests/e2e/       Parcours HTTP et navigateur Playwright
scripts/         Vérification des feeds utilisée localement et en CI
```

- [Cadrage initial](docs/supply-chain-disruption-manager.md)
- [Contrat API et invariants métier](docs/api-contract.md)
- [Guides par audience : démo, sécurité, Agent 365, architecture et déploiement](docs/README.md)
- [Plan de préparation Azure](.azure/deployment-plan.md)

Les fichiers d'état locaux et les artefacts de test sont ignorés par Git.
Consulter `CONTRIBUTING.md` pour les contributions et `SECURITY.md` pour le
signalement d'un problème de sécurité. Licence MIT.
