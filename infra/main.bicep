targetScope = 'resourceGroup'

@sealed()
type BackendEnvironmentVariable = {
  name: string
  value: string
}

@description('Explicitly approved Azure region; no region is selected by this template.')
@minLength(1)
param location string
@allowed(['demo'])
param environment string = 'demo'
@description('Accountable owner; do not put personal data in tags.')
@minLength(1)
param owner string
@minLength(1)
param costCenter string
@description('Immutable, reviewed image URI from an approved registry, including @sha256 digest. Build using the root Dockerfile.')
@minLength(1)
param containerImage string
@description('Existing Entra tenant GUID. This template creates no app registrations or tenant grants.')
@minLength(36)
@maxLength(36)
param tenantId string
@description('Existing API application client ID; Easy Auth validates bearer tokens for this app.')
@minLength(36)
@maxLength(36)
param apiApplicationClientId string
@description('Exact access-token aud accepted by BOTH APIM and backend. Usually the API client ID for v2 access tokens.')
@minLength(1)
param apiAudience string
@description('Explicit approved browser/workload client IDs. No wildcard and no caller-controlled x-agent identity.')
@minLength(1)
@maxLength(100)
param allowedClientApplicationIds string[]
@description('Exact approved HTTPS SPA origins for APIM bearer CORS. Empty means no cross-origin browser support. Also configure PERNOVA_ALLOWED_ORIGINS in backendEnvironment.')
@maxLength(20)
param allowedBrowserOrigins string[] = []
@description('Agent workload azp/client-ID -> allowed tools array. Empty object denies all MCP calls. Synchronize with backend server-side agent registry.')
param mcpClientToolAllowlist object = {}
@description('Existing Foundry NEW resource OpenAI v1 base URL, copied from the resource. Empty disables the model route. No classic resources or keys.')
@maxLength(2000)
param foundryOpenAiV1Endpoint string = ''
@description('Existing Foundry NEW project endpoint; required with the resource v1 endpoint and nonempty model allowlist to enable inference. No hosted agents are deployed.')
@maxLength(2048)
param foundryProjectEndpoint string = ''
@description('Exact model DEPLOYMENT names accepted by Responses API; empty list denies all inference.')
@maxLength(32)
param allowedModelDeployments string[] = []
@description('Explicit Config.from_env settings: PERNOVA_MODE=connected, PERNOVA_JWT_ISSUER/AUDIENCE/JWKS_URL, allowed hosts/origins, data directory and optional APIM inference. No secrets. See docs/deployment.md.')
@minLength(1)
@maxLength(50)
param backendEnvironment BackendEnvironmentVariable[]
@description('Approved registry hostname for private images; empty uses the supplied public/anonymous image. Assign AcrPull to backend identity separately before deployment.')
param registryServer string = ''
@description('APIM publisher contact for this approved deployment; not committed tenant data.')
@minLength(1)
param publisherEmail string
param publisherName string = 'Pernova demo'
@description('Developer tier deliberately has no production SLA. Supports rate-limit-by-key and llm-token-limit; Consumption is not interchangeable.')
@allowed(['Developer'])
param apimSku string = 'Developer'
@minValue(30)
@maxValue(730)
param logRetentionDays int = 30
@description('Keep false while APIM diagnostics use instrumentation-key ingestion. Application traces use a UAMI-authenticated Azure Monitor exporter; do not disable local auth without proving every ingestion path compatible.')
param applicationInsightsDisableLocalAuth bool = false

var suffix = uniqueString(resourceGroup().id)
// Partial configuration must never publish an inference route without a project.
var foundryInferenceEnabled = !empty(foundryOpenAiV1Endpoint) && !empty(foundryProjectEndpoint) && !empty(allowedModelDeployments)
var tags = {
  env: environment
  workload: 'pernova'
  owner: owner
  costCenter: costCenter
  dataClassification: 'synthetic'
}

resource backendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: 'id-pernova-api-${environment}'
  location: location
  tags: tags
}

resource gatewayIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: 'id-pernova-gateway-${environment}'
  location: location
  tags: tags
}

resource logs 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: 'log-pernova-${environment}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: logRetentionDays
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-pernova-${environment}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableLocalAuth: applicationInsightsDisableLocalAuth
  }
}

resource appEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: 'cae-pernova-${environment}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource backend 'Microsoft.App/containerApps@2025-01-01' = {
  name: 'ca-pernova-api-${environment}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${backendIdentity.id}': {} }
  }
  properties: {
    managedEnvironmentId: appEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'http'
        allowInsecure: false
      }
      registries: empty(registryServer) ? [] : [
        { server: registryServer, identity: backendIdentity.id }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: containerImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat([
            { name: 'AZURE_CLIENT_ID', value: backendIdentity.properties.clientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
          ], backendEnvironment)
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health/live', port: 8000, scheme: 'HTTP', httpHeaders: [{ name: 'Host', value: 'localhost' }] }
              initialDelaySeconds: 15
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health/ready', port: 8000, scheme: 'HTTP', httpHeaders: [{ name: 'Host', value: 'localhost' }] }
              initialDelaySeconds: 10
              periodSeconds: 10
            }
          ]
        }
      ]
      // SQLite is intentionally ephemeral. Never scale this demo to multiple writers.
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}

resource authentication 'Microsoft.App/containerApps/authConfigs@2025-01-01' = {
  parent: backend
  name: 'current'
  properties: {
    platform: { enabled: true }
    globalValidation: {
      unauthenticatedClientAction: 'Return401'
      // Public shell must load before MSAL can acquire a bearer token.
      // Exact root/static files and the assets prefix only; never exclude /api or /mcp.
      excludedPaths: [
        '/health/live'
        '/health/ready'
        '/'
        '/assets/*'
        '/theme.js'
        '/favicon.svg'
      ]
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: apiApplicationClientId
          openIdIssuer: '${az.environment().authentication.loginEndpoint}${tenantId}/v2.0'
        }
        validation: { allowedAudiences: [apiAudience] }
      }
    }
    httpSettings: { requireHttps: true }
  }
}

resource gateway 'Microsoft.ApiManagement/service@2024-05-01' = {
  name: 'apim-pernova-${environment}-${suffix}'
  location: location
  tags: tags
  sku: { name: apimSku, capacity: 1 }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${gatewayIdentity.id}': {} }
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
    customProperties: {
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls10': 'false'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls11': 'false'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls10': 'false'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls11': 'false'
    }
  }
}

var namedValues = [
  { name: 'pernova-tenant-id', value: tenantId }
  { name: 'pernova-api-audience', value: apiAudience }
  { name: 'pernova-backend-url', value: 'https://${backend.properties.configuration.ingress.fqdn}' }
  // Base64 avoids injecting JSON quotes into C# policy-expression string literals.
  { name: 'pernova-client-ids-json', value: base64(string(allowedClientApplicationIds)) }
  { name: 'pernova-mcp-allowlist-json', value: base64(string(mcpClientToolAllowlist)) }
  { name: 'pernova-models-json', value: base64(string(allowedModelDeployments)) }
  { name: 'pernova-foundry-v1-url', value: foundryOpenAiV1Endpoint }
  { name: 'pernova-gateway-client-id', value: gatewayIdentity.properties.clientId }
  { name: 'pernova-backend-client-id', value: backendIdentity.properties.clientId }
]

var namedValueNames = [
  'pernova-tenant-id'
  'pernova-api-audience'
  'pernova-backend-url'
  'pernova-client-ids-json'
  'pernova-mcp-allowlist-json'
  'pernova-models-json'
  'pernova-foundry-v1-url'
  'pernova-gateway-client-id'
  'pernova-backend-client-id'
]
resource values 'Microsoft.ApiManagement/service/namedValues@2024-05-01' = [for (name, index) in namedValueNames: {
  parent: gateway
  name: name
  properties: { displayName: name, value: empty(namedValues[index].value) ? 'disabled' : namedValues[index].value, secret: false }
}]

resource rpcSchema 'Microsoft.ApiManagement/service/schemas@2024-05-01' = {
  parent: gateway
  name: 'pernova-json-rpc'
  properties: {
    schemaType: 'json'
    value: loadTextContent('schemas/json-rpc.json')
  }
}
resource responsesSchema 'Microsoft.ApiManagement/service/schemas@2024-05-01' = {
  parent: gateway
  name: 'pernova-responses'
  properties: {
    schemaType: 'json'
    value: loadTextContent('schemas/responses.json')
  }
}

resource controlApi 'Microsoft.ApiManagement/service/apis@2024-05-01' = {
  parent: gateway
  name: 'pernova-control'
  properties: {
    displayName: 'Pernova control API'
    path: 'pernova'
    protocols: ['https']
    subscriptionRequired: false
    serviceUrl: 'https://${backend.properties.configuration.ingress.fqdn}'
  }
}
resource controlOperations 'Microsoft.ApiManagement/service/apis/operations@2024-05-01' = [for method in ['GET', 'POST', 'PUT']: {
  parent: controlApi
  name: toLower(method)
  properties: {
    displayName: '${method} bounded control routes'
    method: method
    urlTemplate: '/*'
    responses: []
  }
}]
// Trusted, reviewed deployment inputs are XML-escaped, never substituted as raw policy markup.
var browserOriginElements = [for origin in allowedBrowserOrigins: '<origin>${replace(replace(replace(string(origin), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')}</origin>']
var browserOriginsXml = join(browserOriginElements, '')
var browserCorsXml = empty(allowedBrowserOrigins) ? '' : replace(loadTextContent('fragments/browser-cors.xml'), '<!-- APPROVED_BROWSER_ORIGINS -->', browserOriginsXml)
var controlPolicyXml = replace(loadTextContent('policies/control.xml'), '<!-- BROWSER_CORS_POLICY -->', browserCorsXml)
resource controlPolicy 'Microsoft.ApiManagement/service/apis/policies@2024-05-01' = {
  parent: controlApi
  name: 'policy'
  properties: { format: 'rawxml', value: controlPolicyXml }
  dependsOn: [values, controlOperations]
}

resource mcpApi 'Microsoft.ApiManagement/service/apis@2024-05-01' = {
  parent: gateway
  name: 'pernova-mcp'
  properties: {
    displayName: 'Pernova bounded JSON-RPC MCP facade (not APIM native MCP import)'
    path: 'pernova-mcp'
    protocols: ['https']
    subscriptionRequired: false
    serviceUrl: 'https://${backend.properties.configuration.ingress.fqdn}'
  }
}
resource mcpOperation 'Microsoft.ApiManagement/service/apis/operations@2024-05-01' = {
  parent: mcpApi
  name: 'post'
  properties: { displayName: 'JSON-RPC POST', method: 'POST', urlTemplate: '/', responses: [] }
}
resource mcpPolicy 'Microsoft.ApiManagement/service/apis/policies@2024-05-01' = {
  parent: mcpApi
  name: 'policy'
  properties: { format: 'rawxml', value: loadTextContent('policies/mcp.xml') }
  dependsOn: [values, mcpOperation, rpcSchema]
}

resource modelApi 'Microsoft.ApiManagement/service/apis@2024-05-01' = if (foundryInferenceEnabled) {
  parent: gateway
  name: 'pernova-responses'
  properties: {
    displayName: 'Pernova Foundry new Responses API'
    path: 'pernova-models/openai/v1'
    protocols: ['https']
    subscriptionRequired: false
    serviceUrl: foundryOpenAiV1Endpoint
  }
}
resource modelOperation 'Microsoft.ApiManagement/service/apis/operations@2024-05-01' = if (foundryInferenceEnabled) {
  parent: modelApi
  name: 'responses'
  properties: { displayName: 'Create response only', method: 'POST', urlTemplate: '/responses', responses: [] }
}
resource modelPolicy 'Microsoft.ApiManagement/service/apis/policies@2024-05-01' = if (foundryInferenceEnabled) {
  parent: modelApi
  name: 'policy'
  properties: { format: 'rawxml', value: loadTextContent('policies/responses.xml') }
  dependsOn: [values, modelOperation, responsesSchema]
}

// Latest documented diagnosticSettings schema. Bicep 0.47's date rule incorrectly
// prefers 2016-09-01 because stable-only selection excludes the current preview.
#disable-next-line use-recent-api-versions
resource gatewayDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: gateway
  name: 'pernova-platform'
  properties: {
    workspaceId: logs.id
    logs: [{ category: 'GatewayLogs', enabled: true }]
    metrics: [{ category: 'AllMetrics', enabled: true }]
  }
}

resource gatewayLogger 'Microsoft.ApiManagement/service/loggers@2024-05-01' = {
  parent: gateway
  name: 'pernova-appinsights'
  properties: {
    loggerType: 'applicationInsights'
    resourceId: insights.id
    credentials: { instrumentationKey: insights.properties.InstrumentationKey }
    isBuffered: true
  }
}
resource gatewayTraceDiagnostics 'Microsoft.ApiManagement/service/diagnostics@2024-05-01' = {
  parent: gateway
  name: 'applicationinsights'
  properties: {
    loggerId: gatewayLogger.id
    alwaysLog: 'allErrors'
    sampling: { samplingType: 'fixed', percentage: 100 }
    httpCorrelationProtocol: 'W3C'
    logClientIp: false
    verbosity: 'error'
    frontend: {
      request: { headers: ['traceparent'], body: { bytes: 0 } }
      response: { headers: [], body: { bytes: 0 } }
    }
    backend: {
      request: { headers: ['traceparent'], body: { bytes: 0 } }
      response: { headers: [], body: { bytes: 0 } }
    }
  }
}

output backendUrl string = 'https://${backend.properties.configuration.ingress.fqdn}'
output controlApiUrl string = '${gateway.properties.gatewayUrl}/pernova'
output mcpUrl string = '${gateway.properties.gatewayUrl}/pernova-mcp/'
output responsesBaseUrl string = foundryInferenceEnabled ? '${gateway.properties.gatewayUrl}/pernova-models/openai/v1/' : ''
output backendIdentityClientId string = backendIdentity.properties.clientId
output gatewayIdentityClientId string = gatewayIdentity.properties.clientId
output existingFoundryProjectEndpoint string = foundryProjectEndpoint
