using './main.bicep'

// Fail closed: values come from an approved environment, never a selected subscription in source.
// This file can compile offline with environment variables, but does not authorize deployment.
// Run python infra\validate_foundry.py before evaluating these approved inputs.
param location = readEnvironmentVariable('PERNOVA_AZURE_REGION')
param owner = readEnvironmentVariable('PERNOVA_RESOURCE_OWNER')
param costCenter = readEnvironmentVariable('PERNOVA_COST_CENTER')
param containerImage = readEnvironmentVariable('PERNOVA_CONTAINER_IMAGE')
param tenantId = readEnvironmentVariable('PERNOVA_ENTRA_TENANT_ID')
param apiApplicationClientId = readEnvironmentVariable('PERNOVA_API_APP_CLIENT_ID')
param apiAudience = readEnvironmentVariable('PERNOVA_API_AUDIENCE')
param allowedClientApplicationIds = json(readEnvironmentVariable('PERNOVA_APPROVED_CLIENT_IDS_JSON'))
param allowedBrowserOrigins = json(readEnvironmentVariable('PERNOVA_BROWSER_ORIGINS_JSON', '[]'))
param backendEnvironment = json(readEnvironmentVariable('PERNOVA_BACKEND_ENV_JSON'))
param publisherEmail = readEnvironmentVariable('PERNOVA_APIM_PUBLISHER_EMAIL')
param mcpClientToolAllowlist = json(readEnvironmentVariable('PERNOVA_MCP_ALLOWLIST_JSON', '{}'))
param allowedModelDeployments = json(readEnvironmentVariable('PERNOVA_MODEL_DEPLOYMENTS_JSON', '[]'))
param foundryOpenAiV1Endpoint = readEnvironmentVariable('PERNOVA_FOUNDRY_OPENAI_V1_ENDPOINT', '')
param foundryProjectEndpoint = readEnvironmentVariable('PERNOVA_FOUNDRY_PROJECT_ENDPOINT', '')
param registryServer = readEnvironmentVariable('PERNOVA_REGISTRY_SERVER', '')
