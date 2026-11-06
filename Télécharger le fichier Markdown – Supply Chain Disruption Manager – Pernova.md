# Supply Chain Disruption Manager

## Démonstration Microsoft Foundry, observabilité de bout en bout et Agent 365 pour Pernova

## 1. Résumé exécutif

Le **Supply Chain Disruption Manager** est un workflow multi-agent destiné à analyser une perturbation logistique, mesurer son impact sur la demande et les stocks, comparer plusieurs plans de mitigation, puis préparer les actions opérationnelles après validation humaine.

Ce scénario combine :

- Une valeur métier immédiatement compréhensible pour les équipes supply chain.
- Une orchestration multi-agent avec Microsoft Foundry.
- Des outils métier simulant SAP S/4HANA, Fabric et des services logistiques.
- Une comparaison de scénarios selon le service client, le coût, le délai, le CO₂ et le risque.
- Une validation humaine avant toute action sensible.
- Un tracing OpenTelemetry de bout en bout.
- Du monitoring avec Azure Monitor et Application Insights.
- Un contrôle des outils et des échanges avec Azure API Management.
- Une démonstration de l’inventaire et de la gouvernance des agents avec Agent 365.
- Un mécanisme applicatif de suspension ou de kill switch en cas de comportement anormal.

L’objectif du MVP n’est pas de recréer un système complet de planification supply chain. Il est de démontrer comment la plateforme Microsoft permet de **construire, orchestrer, observer, contrôler et gouverner un workflow agentique d’entreprise**.

---

## 2. Scénario de démonstration

### Situation initiale

Une cargaison de bouteilles destinée à la France est bloquée dans un port européen pendant sept jours.

Cette perturbation menace :

- Une promotion nationale commençant dans dix jours.
- Plusieurs commandes de distributeurs.
- Le stock de sécurité de deux entrepôts.
- Le niveau de service promis aux clients prioritaires.

L’utilisateur demande :

> « Une cargaison est retardée de sept jours. Analyse l’impact sur les commandes françaises et recommande un plan de mitigation. »

Le système ne se contente pas de produire une réponse textuelle. Il :

1. Qualifie l’incident.
2. Analyse en parallèle la demande, les stocks et les options logistiques.
3. Simule plusieurs scénarios.
4. Recommande le meilleur compromis.
5. Applique les politiques de contrôle.
6. Demande une approbation humaine lorsque cela est nécessaire.
7. Prépare ou exécute l’action autorisée.
8. Conserve la trace complète des décisions et appels d’outils.

---

## 3. Agents du workflow

Le workflow comprend six agents spécialisés, orchestrés par un agent superviseur.

| Agent | Responsabilité | Sources et outils simulés | Résultat |
|---|---|---|---|
| **Disruption Intake Agent** | Comprendre et qualifier l’incident | Email, PDF transporteur, API logistique | Incident structuré |
| **Demand & Priority Agent** | Identifier la demande exposée et les priorités | Fabric, prévisions, promotions | Commandes et marchés prioritaires |
| **Inventory Agent** | Reconstituer les stocks disponibles | SAP S/4HANA simulé | ATP, stock de sécurité, transferts possibles |
| **Logistics Agent** | Rechercher les solutions de transport alternatives | API transporteurs, coûts et délais | Routes et modes alternatifs |
| **Scenario Simulation Agent** | Comparer et scorer les options | Règles métier, calculateur déterministe | Scénarios comparés et classés |
| **Decision & Execution Agent** | Préparer et exécuter le plan validé | SAP simulé, Teams, email | Actions soumises à approbation |

### Supply Chain Supervisor Agent

Le superviseur :

1. Crée un identifiant de corrélation unique.
2. Décompose la mission en tâches spécialisées.
3. Lance certains agents en parallèle.
4. Vérifie la qualité et la cohérence des données reçues.
5. Demande une nouvelle analyse en cas d’information manquante ou contradictoire.
6. Compare les scénarios.
7. Soumet la recommandation à une validation humaine.
8. Autorise uniquement les actions approuvées.
9. Gère le mode dégradé lorsqu’un agent est suspendu.

Cette orchestration doit être visible à la fois dans l’interface utilisateur et dans les traces OpenTelemetry.

---

## 4. Workflow de bout en bout

### Étape 1 : détection et qualification

Le **Disruption Intake Agent** reçoit un événement tel que :

```json
{
  "shipmentId": "SHP-PR-2048",
  "product": "Premium Spirit 70cl",
  "quantity": 12000,
  "destination": "France",
  "originalArrival": "2026-11-09",
  "estimatedDelayDays": 7,
  "reason": "Port congestion"
}
```

Il détermine :

- Le produit concerné.
- La quantité affectée.
- Les commandes potentiellement dépendantes.
- La période d’impact.
- Le marché concerné.
- Le niveau initial de sévérité.

Il publie ensuite un événement métier :

```text
SupplyChainDisruptionDetected
```

### Étape 2 : analyses parallèles

Le superviseur lance trois branches simultanément.

#### Demand & Priority Agent

Pour la démonstration, il peut identifier :

- 8 500 bouteilles nécessaires pour une promotion.
- 2 000 bouteilles réservées à des commandes prioritaires.
- 1 500 bouteilles affectées à des commandes standard.

#### Inventory Agent

Il peut retrouver :

- 3 200 unités disponibles en France.
- 4 500 unités disponibles en Belgique.
- 2 800 unités disponibles en Espagne.
- Un stock de sécurité minimal de 2 000 unités par entrepôt.

#### Logistics Agent

Il évalue notamment :

- Un transfert routier depuis la Belgique.
- Un transfert depuis l’Espagne.
- Une livraison partielle par transport accéléré.
- Un fractionnement de l’expédition.
- Un report contrôlé de certaines commandes non prioritaires.

> **Important :** ces chiffres sont des données synthétiques conçues pour la démonstration. Ils ne représentent pas des données réelles de Pernova.

### Étape 3 : simulation des scénarios

Le **Scenario Simulation Agent** construit plusieurs options comparables.

| Scénario | Service client | Surcoût | Délai | Risque |
|---|---:|---:|---:|---|
| Attendre la cargaison | 68 % | 0 € | 7 jours | Élevé |
| Transfert Belgique et priorisation | 94 % | 18 500 € | 2 jours | Faible |
| Transport accéléré et transferts multiples | 99 % | 52 000 € | 1 jour | Moyen |

Une formule simple et explicable peut être utilisée :

```text
Score = 45 % service + 20 % coût + 15 % délai + 10 % CO₂ + 10 % risque
```

Le scénario recommandé pourrait être :

> Transférer 4 000 unités depuis la Belgique, préserver son stock de sécurité, affecter le stock disponible en France aux commandes prioritaires et reporter les commandes standard de faible criticité.

Les pondérations doivent pouvoir être modifiées dans l’interface afin de relancer la comparaison et de montrer l’impact des priorités métier.

---

## 5. Moment « wow » : contrôle et approbation humaine

Le **Decision & Execution Agent** tente de créer un transfert inter-pays de 4 000 unités depuis l’entrepôt belge.

La politique de démonstration stipule :

```text
Tout transfert inter-pays supérieur à 2 500 unités
ou générant plus de 15 000 € de coût additionnel
nécessite une approbation humaine.
```

### Séquence de contrôle

1. L’agent appelle l’outil `create_stock_transfer`.
2. Azure API Management identifie l’agent, l’outil et le contexte.
3. Le moteur de politiques évalue les paramètres.
4. L’opération est bloquée avant toute écriture.
5. Une demande d’approbation apparaît dans Teams ou dans l’application.
6. Le responsable peut :
   - Approuver.
   - Refuser.
   - Modifier la quantité.
   - Demander une nouvelle simulation.
7. Après approbation, l’agent réessaie avec le même identifiant métier et une clé d’idempotence.
8. Le faux ordre de transfert est créé dans le simulateur SAP.

Cette séquence permet de distinguer clairement :

- Une recommandation générative.
- Une décision encadrée par des règles.
- Une action déterministe.
- Une opération sensible approuvée par un humain.

---

## 6. Variante sécurité et kill switch

Pour démontrer les capacités de monitoring et de contrôle, un comportement anormal est introduit volontairement.

### Incident simulé

Le **Logistics Agent** entre dans une boucle et appelle l’API de simulation vingt fois en quelques secondes.

### Seuils possibles

- Plus de 10 appels d’outil en 30 secondes.
- Plus de 25 000 tokens sur une exécution.
- Plus de 15 € de coût simulé par workflow.
- Trois erreurs consécutives.
- Appel d’un outil absent de la politique de l’agent.
- Tentative d’accès à un pays ou à un périmètre non autorisé.

### Réaction attendue

1. Azure Monitor détecte l’écart.
2. Une alerte est créée dans Application Insights.
3. Le backend positionne l’agent en état `SUSPENDED`.
4. Les appels suivants sont refusés par la gateway ou le middleware d’autorisation.
5. Le workflow principal passe en mode dégradé.
6. Une investigation est créée avec le `trace_id`.
7. L’opérateur analyse la trace et peut réactiver l’agent.

> Le kill switch automatique doit être présenté comme un mécanisme implémenté dans le backend, les politiques et la gateway. Il ne faut pas le présenter comme une capacité native systématique d’Agent 365.

---

## 7. Architecture technique

```text
React Web Application
        |
        v
FastAPI Orchestrator
        |
        v
Microsoft Foundry Agent Service
        |
        +-- Disruption Intake Agent
        +-- Demand & Priority Agent
        +-- Inventory Agent
        +-- Logistics Agent
        +-- Scenario Simulation Agent
        +-- Decision & Execution Agent
        |
        v
Azure API Management / AI Gateway
        |
        +-- Simulated SAP MCP Server
        +-- Logistics MCP Server
        +-- Fabric Data API
        +-- Approval Service
        |
        v
Application Insights + Azure Monitor
        |
        v
Agent 365 governance experience
```

### Frontend

- React.
- TypeScript.
- Fluent UI.
- Server-Sent Events ou WebSocket pour suivre l’exécution.
- Graphe visuel des agents.
- Panneau d’approbation.
- Comparateur interactif de scénarios.
- Vue de gouvernance et d’observabilité.

### Backend

- Python 3.12.
- FastAPI.
- Microsoft Agent Framework.
- Microsoft Foundry Agent Service.
- Pydantic pour les contrats de données structurés.
- PostgreSQL ou Cosmos DB pour l’état du workflow.
- Couche déterministe pour les calculs, règles et autorisations.

### Outils métier simulés

- Serveur MCP simulant SAP.
- Serveur MCP logistique.
- API simulant les données Fabric.
- Service d’approbation Teams ou web.
- Catalogue de politiques au format JSON ou YAML.

### Observabilité

- OpenTelemetry.
- Azure Monitor OpenTelemetry Distro.
- Application Insights.
- Log Analytics.
- Azure Monitor Workbooks.

### Sécurité et gouvernance

- Microsoft Entra ID.
- Managed identity par service ou composant.
- RBAC sur les outils.
- Azure API Management comme point de contrôle.
- Validation humaine pour les opérations sensibles.
- Agent 365 pour les capacités d’inventaire, de visibilité, de sécurité et de gouvernance réellement disponibles dans le tenant de démonstration.

---

## 8. Modèle de tracing

Chaque exécution doit disposer de :

- Un `trace_id` technique.
- Un `workflow.id`.
- Un `business_case_id` ou `business.incident_id`.
- Un identifiant d’agent.
- Une version d’agent.
- Une clé d’idempotence pour les actions métier.

### Arborescence indicative des spans

```text
supply-chain-disruption-manager
├── parse-disruption
├── assess-demand
│   ├── query-demand-forecast
│   └── query-promotions
├── assess-inventory
│   ├── get-france-atp
│   ├── get-belgium-atp
│   └── get-spain-atp
├── evaluate-logistics
│   ├── calculate-road-transfer
│   └── calculate-expedited-shipping
├── simulate-scenarios
├── evaluate-policy
├── request-human-approval
└── create-stock-transfer
```

### Attributs à ajouter aux traces

```text
agent.id
agent.name
agent.version
workflow.id
business.incident_id
business.market
tool.name
tool.risk_level
model.name
model.provider
tokens.input
tokens.output
cost.estimated
approval.status
policy.decision
policy.reason
data.classification
```

### Métriques à exposer

- Latence totale du workflow.
- Latence par agent et par outil.
- Nombre d’appels LLM.
- Nombre d’appels d’outils.
- Tokens en entrée et en sortie.
- Coût estimé par agent et par workflow.
- Taux d’erreur.
- Nombre de tentatives et de retries.
- Nombre d’actions bloquées par une politique.
- Temps moyen d’attente d’une approbation.
- Nombre d’agents actifs, suspendus ou dégradés.

---

## 9. Écrans de la démonstration

### Écran 1 : Control Tower

Il affiche :

- L’incident en cours.
- La cargaison retardée.
- Les marchés concernés.
- Le niveau de sévérité.
- Les commandes exposées.
- Le statut global du workflow.

### Écran 2 : Agent Execution Graph

Il montre en temps réel :

- Les agents actifs.
- Les agents terminés.
- Les agents en erreur ou suspendus.
- Les appels aux outils.
- Les dépendances entre tâches.
- Les temps d’exécution.
- Le point exact d’un blocage de politique.

### Écran 3 : Scenario Comparison

Il présente les options avec :

- Le taux de service.
- Le surcoût.
- Le délai.
- Le CO₂ estimé.
- Le niveau de risque.
- Le score global.
- L’explication de la recommandation.

L’utilisateur peut modifier la pondération des critères et relancer la comparaison.

### Écran 4 : Governance & Observability

Il affiche :

- Le `trace_id`.
- Les appels LLM.
- Les appels d’outils.
- Les tokens et coûts.
- La latence par agent.
- Les décisions de politique.
- Les approbations.
- Les alertes.
- L’état actif ou suspendu de chaque agent.
- Le propriétaire et la version de l’agent.

---

## 10. Répartition agentique et déterministe

Tout ne doit pas être confié à un LLM.

### À confier aux agents

- Compréhension de l’incident.
- Recherche et synthèse des informations.
- Choix des données à consulter.
- Formulation des hypothèses.
- Explication des scénarios.
- Préparation du plan d’action.
- Production d’un résumé adapté à l’utilisateur.

### À garder déterministe

- Calcul des quantités.
- Vérification des stocks disponibles.
- Application du stock de sécurité.
- Calcul des coûts.
- Calcul des délais.
- Calcul du score final.
- Application des seuils.
- Autorisation d’une action.
- Création de l’ordre de transfert.
- Gestion de l’idempotence.
- Activation du kill switch.

Cette séparation réduit les risques et rend le workflow plus explicable, testable et auditable.

---

## 11. Périmètre MVP

### Objectif

Construire en trois à cinq jours une démonstration crédible du pattern de plateforme.

### Inclus dans le MVP

- Un événement de perturbation prédéfini.
- Quatre agents réels et deux fonctions déterministes.
- Trois outils MCP simulés.
- Trois scénarios calculés.
- Une approbation humaine.
- Une trace OpenTelemetry complète.
- Un dashboard Application Insights.
- Un kill switch applicatif.
- Une vue expliquant le rôle d’Agent 365.

### À ne pas intégrer initialement

- Un accès SAP réel.
- Une optimisation mathématique complexe.
- Des données logistiques réelles de Pernova.
- Une intégration EDI complète.
- Un moteur de prévision réel.
- Une décision autonome irréversible.
- Un déploiement industriel complet.

---

## 12. Plan de réalisation en cinq jours

### Jour 1 : modèle métier et simulateurs

- Définir le schéma de l’incident.
- Créer les données synthétiques de demande et de stock.
- Implémenter les simulateurs SAP, Fabric et logistique.
- Définir les politiques et seuils.

### Jour 2 : agents et orchestration

- Implémenter le superviseur.
- Créer les agents Demand, Inventory et Logistics.
- Paralléliser les analyses.
- Structurer toutes les réponses avec Pydantic.

### Jour 3 : simulation et approbation

- Implémenter le moteur déterministe de scoring.
- Ajouter la comparaison des scénarios.
- Ajouter la demande d’approbation.
- Ajouter la création idempotente du transfert simulé.

### Jour 4 : observabilité et sécurité

- Instrumenter le backend avec OpenTelemetry.
- Ajouter les attributs métier aux spans.
- Envoyer les traces et métriques vers Application Insights.
- Implémenter les alertes et le kill switch.

### Jour 5 : interface et répétition

- Finaliser les quatre écrans.
- Ajouter le flux d’événements en temps réel.
- Préparer le scénario nominal et le scénario anormal.
- Vérifier les traces et tableaux de bord.
- Répéter une démonstration de 10 à 15 minutes.

---

## 13. Narration de démonstration

> Une perturbation logistique est détectée. Plusieurs agents Microsoft Foundry évaluent simultanément la demande, les stocks et les options de transport. Ils simulent trois plans de mitigation et recommandent le meilleur compromis entre niveau de service, coûts et risques. Lorsque l’agent tente d’exécuter un transfert sensible, la plateforme applique une politique, demande une validation humaine et conserve la trace complète de la décision. Si un agent adopte un comportement anormal, il est immédiatement suspendu. Agent 365 apporte ensuite la couche de visibilité et de gouvernance disponible dans l’environnement d’entreprise.

### Message central

> **Microsoft Foundry construit et orchestre le workflow. Azure Monitor et Application Insights permettent de l’observer. Azure API Management contrôle les échanges et les outils. Agent 365 contribue à gouverner l’agent dans l’entreprise.**

---

## 14. Points de vigilance

- Présenter toutes les données comme synthétiques.
- Ne pas laisser le LLM effectuer les calculs critiques.
- Ne jamais exécuter une opération sensible sans contrôle déterministe.
- Utiliser une clé d’idempotence pour éviter les doublons.
- Propager le même identifiant de corrélation entre les agents et les outils.
- Masquer les données sensibles dans les prompts et les traces.
- Prévoir des timeouts, des retries limités et un circuit breaker.
- Distinguer clairement les capacités natives des composants Microsoft des mécanismes développés dans l’application.
- Ne pas présenter Agent 365 comme fournissant automatiquement l’ensemble du kill switch, des politiques métier et de la corrélation des traces.
- Préparer un mode démonstration hors ligne ou dégradé en cas d’indisponibilité d’un service.

---

## 15. Résultat attendu

À la fin de la démonstration, l’audience doit avoir vu :

1. Un incident supply chain concret.
2. Une collaboration multi-agent visible.
3. Des outils d’entreprise contrôlés.
4. Trois scénarios comparés avec des critères transparents.
5. Une action bloquée par une politique.
6. Une approbation humaine.
7. Une exécution métier simulée et idempotente.
8. Une trace de bout en bout.
9. Des métriques de coûts, tokens, latence et erreurs.
10. La suspension d’un agent au comportement anormal.
11. La contribution d’Agent 365 à la visibilité et à la gouvernance des agents.

Le scénario illustre ainsi la proposition de valeur complète :

> **Construire des agents utiles, les connecter aux systèmes métier, mesurer leur comportement, contrôler leurs actions et les gouverner à l’échelle de l’entreprise.**
