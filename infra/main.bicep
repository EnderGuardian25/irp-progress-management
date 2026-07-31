// The IRP Progress Management System's Azure footprint.
//
// Resource-group scoped on purpose. The deploy service principal holds
// Contributor on THIS RESOURCE GROUP only, not the subscription, so the
// resource group is created once by hand (see docs/deploy-runbook.md) rather
// than by a subscription-scoped template.
//
// Governed by ADR-0009. Do not change region, SKU tier or the replica floor
// without amending it.
targetScope = 'resourceGroup'

@description('Azure region for every resource. ADR-0009 D4 fixes Southeast Asia; Central India is the recorded fallback if Burstable B1ms capacity is unavailable.')
param location string = resourceGroup().location

@description('Name prefix for every resource. Short because Postgres server names become part of a public DNS label.')
@minLength(3)
@maxLength(11)
param namePrefix string = 'irp'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    // Both container apps ship stdout here, so this is where a failed deploy
    // gets diagnosed. 30 days is the free-tier retention.
    retentionInDays: 30
  }
}

// Workspace-based, which is the only mode still supported for new components.
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// NOTE: appInsights.properties.ConnectionString is deliberately NOT an output.
// Deployment outputs are readable from deployment history, and the linter's
// outputs-should-not-contain-secrets rule is set to error. Task 4 references it
// inline as a container-app secret instead.
//
// NOTE on the absence of an egress output: ManagedEnvironmentProperties exposes
// no outbound-IP property at all — only staticIp, which is the INBOUND address.
// Verified offline in Task 1; see the design spec 5. That is why the Postgres
// firewall allowlist is a parameter rather than a template reference.
output containerAppsEnvironmentId string = containerAppsEnvironment.id
output containerAppsDefaultDomain string = containerAppsEnvironment.properties.defaultDomain
