param(
  [ValidateSet('all', 'customer', 'pos', 'admin')]
  [string]$App = 'all',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$targets = @(
  @{ App = 'pos'; Project = 'jaydscafe-pos'; Config = 'vercel.pos.json' },
  @{ App = 'admin'; Project = 'jaydscafe-admin'; Config = 'vercel.admin.json' },
  @{ App = 'customer'; Project = 'jaydscafe'; Config = 'vercel.customer.json' }
)

# Manage environment variables in Vercel. Keep secrets out of CLI arguments
# and keep local environment files out of the upload.
$previousUpdateSetting = $env:NO_UPDATE_NOTIFIER
$env:NO_UPDATE_NOTIFIER = '1'
Push-Location $repoRoot
try {
  foreach ($target in $targets) {
    if ($App -ne 'all' -and $App -ne $target.App) { continue }
    $deployArgs = @('--yes', 'vercel@62.7.0', 'deploy', '.', '--prod', '--yes',
      '--scope', 'aaron-martinezs-projects-ea1c41f7',
      '--project', $target.Project, '--local-config', $target.Config)
    if ($DryRun) { $deployArgs += @('--dry', '--json') }
    Write-Host "Deploying $($target.App) to $($target.Project)"
    & npx.cmd @deployArgs
    if ($LASTEXITCODE -ne 0) { throw "Deployment failed: $($target.App)" }
  }
}
finally {
  Pop-Location
  $env:NO_UPDATE_NOTIFIER = $previousUpdateSetting
}
