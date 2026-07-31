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

@description('Postgres administrator login. No default, per the adminusername-should-not-be-literal linter rule. Azure rejects "admin", "azure_superuser", "postgres" and a few others.')
param postgresAdminUsername string

@description('Postgres administrator password. Supplied from a GitHub secret; never committed. Entra authentication for Postgres would remove this credential entirely, but needs the Entra work this plan defers.')
@secure()
param postgresAdminPassword string

@description('IPv4 addresses allowed to reach Postgres, each added as a single-address firewall rule. Deliberately defaults to EMPTY: an empty allowlist creates no rule at all, so a forgotten value fails closed as a connection error rather than silently opening the server. Populated per docs/deploy-runbook.md.')
param allowedClientIpAddresses array = []

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

// ADR-0009 D2: public endpoint with a firewall allowlist and TLS, NOT VNet
// integration. That is a documented, demo-scoped compromise, not an oversight —
// the database holds student submission text, which is personal data, and this
// is weaker than a private endpoint. It is the first thing to change if the
// system ever holds real student data. Recorded as a stated limitation in
// docs/deploy-runbook.md.
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${namePrefix}-pg'
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUsername
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'irp'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// One single-address rule per entry. An empty array produces no rules at all,
// which is the intended fail-closed behaviour.
//
// Explicitly NOT the "allow public access from all Azure services" rule
// (start/end 0.0.0.0), which ADR-0009 rejected: it admits ANY Azure tenant's
// resources, so it reads as a restriction while being close to no network
// control at all.
resource firewallRules 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = [
  for (address, index) in allowedClientIpAddresses: {
    parent: postgres
    name: 'allow-${index}'
    properties: {
      startIpAddress: address
      endIpAddress: address
    }
  }
]

// sslmode=require is not optional — ADR-0009 D2 pairs the public endpoint with
// TLS, and Prisma will happily connect without it if not told otherwise.
var databaseUrl = 'postgresql://${postgresAdminUsername}:${postgresAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/irp?schema=public&sslmode=require'

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
// TEMPORARY, deleted in Task 4. `databaseUrl` has no consumer until the api
// container app exists, and no-unused-vars is an error, so this keeps the tree
// green at every commit. Deliberately a BOOL, not the value: emitting the
// interpolated connection string would put a password in deployment history.
output databaseUrlIsConsumedInTask4 bool = !empty(databaseUrl)
