// A COMMITTED EXAMPLE. Copy, fill in, and keep your copy out of git.
// Contains no real values and no secrets.
//
// The real deploy does not use a .bicepparam file at all — the workflow passes
// parameters on the command line so the password can come from a GitHub secret
// and never touch disk. This file exists so a human can see every parameter the
// template requires in one place.
using './main.bicep'

param location = 'southeastasia'
param namePrefix = 'irp'
// Azure rejects 'admin', 'postgres', 'azure_superuser' and a few others.
param postgresAdminUsername = 'irpadmin'
// Never a real value here. Supply on the command line or from a secret store.
param postgresAdminPassword = ''
// Auth.js cookie encryption key: openssl rand -base64 32. Never a real value
// here either.
param authSecret = ''
// Empty until the first apply reveals the environment's egress address, which
// the template cannot reference: ManagedEnvironmentProperties exposes no
// outbound-IP property at all (verified in Task 1). See docs/deploy-runbook.md.
// Empty means NO firewall rule is created — deliberately fail-closed.
param allowedClientIpAddresses = []
// Always a git SHA, never 'latest'. /health reports the baked-in APP_VERSION,
// so the deployed commit stays verifiable from outside.
param imageTag = 'replace-with-a-git-sha'
