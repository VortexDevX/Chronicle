param(
  [string]$ProjectId = "chroniclex-android",
  [string]$ProjectNumber = "277775139512",
  [string]$ServiceAccountId = "chronicle-fcm-sender",
  [string]$EnvPath = (Join-Path $PSScriptRoot "..\.env")
)

$ErrorActionPreference = "Stop"

function Invoke-GoogleApi {
  param(
    [Parameter(Mandatory)] [ValidateSet("GET", "POST", "DELETE")] [string]$Method,
    [Parameter(Mandatory)] [string]$Uri,
    [object]$Body
  )

  $arguments = @{
    Method = $Method
    Uri = $Uri
    Headers = @{ Authorization = "Bearer $script:AccessToken" }
  }
  if ($null -ne $Body) {
    $arguments.ContentType = "application/json"
    $arguments.Body = $Body | ConvertTo-Json -Depth 20 -Compress
  }
  Invoke-RestMethod @arguments
}

function Test-DotEnvConfigured {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $content = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path))
  return (
    $content -match "(?m)^FIREBASE_PROJECT_ID=.+$" -and
    $content -match "(?m)^FIREBASE_CLIENT_EMAIL=.+$" -and
    $content -match "(?m)^FIREBASE_PRIVATE_KEY=.+$"
  )
}

if (Test-DotEnvConfigured -Path $EnvPath) {
  Write-Host "Firebase push variables already exist in .env; no new key created."
  exit 0
}

$firebaseConfigPath = Join-Path $env:USERPROFILE ".config\configstore\firebase-tools.json"
if (-not (Test-Path -LiteralPath $firebaseConfigPath)) {
  throw "Firebase CLI login not found. Run: firebase login --no-localhost"
}

$firebaseConfig = Get-Content -LiteralPath $firebaseConfigPath -Raw | ConvertFrom-Json
$script:AccessToken = [string]$firebaseConfig.tokens.access_token
$expiresAt = [long]$firebaseConfig.tokens.expires_at
if (-not $script:AccessToken -or $expiresAt -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) {
  throw "Firebase CLI access token expired. Run a Firebase command to refresh login, then retry."
}

$serviceAccountEmail = "$ServiceAccountId@$ProjectId.iam.gserviceaccount.com"
$encodedEmail = [Uri]::EscapeDataString($serviceAccountEmail)
$serviceAccountName = "projects/$ProjectId/serviceAccounts/$serviceAccountEmail"
$createdKeyName = $null

try {
  Invoke-GoogleApi -Method POST -Uri "https://serviceusage.googleapis.com/v1/projects/$ProjectNumber/services/fcm.googleapis.com`:enable" -Body @{} | Out-Null

  try {
    Invoke-GoogleApi -Method GET -Uri "https://iam.googleapis.com/v1/projects/$ProjectId/serviceAccounts/$encodedEmail" | Out-Null
  } catch {
    if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }
    Invoke-GoogleApi -Method POST -Uri "https://iam.googleapis.com/v1/projects/$ProjectId/serviceAccounts" -Body @{
      accountId = $ServiceAccountId
      serviceAccount = @{
        displayName = "Chronicle FCM Sender"
        description = "Sends Android release notifications from Chronicle cron"
      }
    } | Out-Null
  }

  $policy = Invoke-GoogleApi -Method POST -Uri "https://cloudresourcemanager.googleapis.com/v1/projects/$ProjectId`:getIamPolicy" -Body @{}
  $member = "serviceAccount:$serviceAccountEmail"
  $role = "roles/firebasecloudmessaging.admin"
  $binding = @($policy.bindings) | Where-Object { $_.role -eq $role } | Select-Object -First 1
  if ($null -eq $binding) {
    $policy.bindings = @($policy.bindings) + @(@{ role = $role; members = @($member) })
  } elseif (@($binding.members) -notcontains $member) {
    $binding.members = @($binding.members) + $member
  }
  Invoke-GoogleApi -Method POST -Uri "https://cloudresourcemanager.googleapis.com/v1/projects/$ProjectId`:setIamPolicy" -Body @{ policy = $policy } | Out-Null

  $key = Invoke-GoogleApi -Method POST -Uri "https://iam.googleapis.com/v1/$serviceAccountName/keys" -Body @{
    privateKeyType = "TYPE_GOOGLE_CREDENTIALS_FILE"
    keyAlgorithm = "KEY_ALG_RSA_2048"
  }
  $createdKeyName = [string]$key.name
  $keyJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$key.privateKeyData)) | ConvertFrom-Json

  $absoluteEnvPath = [IO.Path]::GetFullPath($EnvPath)
  $existing = if (Test-Path -LiteralPath $absoluteEnvPath) {
    [IO.File]::ReadAllText($absoluteEnvPath)
  } else {
    ""
  }
  $newline = if ($existing.Contains("`r`n")) { "`r`n" } else { "`n" }
  $clean = [Regex]::Replace(
    $existing,
    "(?m)^FIREBASE_(PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY)=.*(?:\r?\n|$)",
    ""
  ).TrimEnd("`r", "`n")
  $escapedPrivateKey = ([string]$keyJson.private_key).Replace("`r", "").Replace("`n", "\n")
  $firebaseBlock = @(
    "FIREBASE_PROJECT_ID=$ProjectId",
    "FIREBASE_CLIENT_EMAIL=$serviceAccountEmail",
    "FIREBASE_PRIVATE_KEY=`"$escapedPrivateKey`""
  ) -join $newline
  $prefix = if ($clean) { "$clean$newline$newline" } else { "" }
  [IO.File]::WriteAllText(
    $absoluteEnvPath,
    "$prefix# Android push notifications (Firebase Cloud Messaging)$newline$firebaseBlock$newline",
    [Text.UTF8Encoding]::new($false)
  )

  $createdKeyName = $null
  Write-Host "Firebase push configured in .env with dedicated FCM-only sender account."
} catch {
  if ($createdKeyName) {
    try {
      Invoke-GoogleApi -Method DELETE -Uri "https://iam.googleapis.com/v1/$createdKeyName" | Out-Null
    } catch {
      Write-Warning "Could not remove the unused service-account key after provisioning failure."
    }
  }
  throw
}
