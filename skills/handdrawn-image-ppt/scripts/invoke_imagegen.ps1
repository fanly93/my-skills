<#
.SYNOPSIS
Runs the bundled imagegen CLI with style reference images and process-only credentials.
.DESCRIPTION
Use only for a user-authorized CLI/API/model workflow. DryRun validates inputs and
prints a non-sensitive command without reading auth.json or calling the provider.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $PythonExecutable,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $PromptFile,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string[]] $ReferenceImages,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $Output,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $Model,

    [string] $BaseUrl,
    [string] $ImagegenCli,
    [string] $DependencyPath,
    [switch] $UseCodexApiKey,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Resolve-InputFile {
    param([string] $Path, [string] $Label)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Label does not exist or is not a file."
    }
    return (Resolve-Path -LiteralPath $Path).ProviderPath
}

function ConvertTo-PrintedArgument {
    param([string] $Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

if ([string]::IsNullOrWhiteSpace($Model)) {
    throw 'Model must not be empty.'
}
if ($ReferenceImages.Count -eq 0) {
    throw 'At least one style reference image is required.'
}

$taskCodexRoot = [Environment]::GetEnvironmentVariable('CODEX_HOME', 'Process')
if ([string]::IsNullOrWhiteSpace($taskCodexRoot)) {
    $taskCodexRoot = Join-Path -Path ([Environment]::GetFolderPath('UserProfile')) -ChildPath '.codex'
}
if ([string]::IsNullOrWhiteSpace($ImagegenCli)) {
    $ImagegenCli = Join-Path -Path $taskCodexRoot -ChildPath 'skills/.system/imagegen/scripts/image_gen.py'
}

$taskPythonPath = Resolve-InputFile -Path $PythonExecutable -Label 'Python executable'
$taskCliPath = Resolve-InputFile -Path $ImagegenCli -Label 'Bundled imagegen CLI'
$taskPromptPath = Resolve-InputFile -Path $PromptFile -Label 'Prompt file'
$taskReferencePaths = @(
    foreach ($taskReference in $ReferenceImages) {
        if ([string]::IsNullOrWhiteSpace($taskReference)) {
            throw 'Reference image paths must not be empty.'
        }
        Resolve-InputFile -Path $taskReference -Label 'Reference image'
    }
)

$taskOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
if (Test-Path -LiteralPath $taskOutputPath) {
    throw 'Output already exists. Choose a new versioned output path; this wrapper never overwrites an existing output.'
}
$taskOutputParent = [IO.Path]::GetDirectoryName($taskOutputPath)
$taskAncestor = $taskOutputParent
while (-not (Test-Path -LiteralPath $taskAncestor)) {
    $taskNextAncestor = [IO.Path]::GetDirectoryName($taskAncestor)
    if ([string]::IsNullOrWhiteSpace($taskNextAncestor) -or $taskNextAncestor -eq $taskAncestor) {
        throw 'Output must have an accessible filesystem parent directory.'
    }
    $taskAncestor = $taskNextAncestor
}
if (-not (Test-Path -LiteralPath $taskAncestor -PathType Container)) {
    throw 'An output parent is a file. Choose a valid output directory.'
}

$taskDependencyPath = $null
if (-not [string]::IsNullOrWhiteSpace($DependencyPath)) {
    if (-not (Test-Path -LiteralPath $DependencyPath -PathType Container)) {
        throw 'DependencyPath does not exist or is not a directory.'
    }
    $taskDependencyPath = (Resolve-Path -LiteralPath $DependencyPath).ProviderPath
}

# Endpoints may be logged. Reject credentials and secret-bearing URL components.
$taskBaseUrl = $BaseUrl
if ([string]::IsNullOrWhiteSpace($taskBaseUrl)) {
    $taskBaseUrl = [Environment]::GetEnvironmentVariable('OPENAI_BASE_URL', 'Process')
}
if (-not [string]::IsNullOrWhiteSpace($taskBaseUrl)) {
    $taskEndpoint = $null
    if (-not [Uri]::TryCreate($taskBaseUrl, [UriKind]::Absolute, [ref] $taskEndpoint) -or
        $taskEndpoint.Scheme -notin @('http', 'https') -or
        -not [string]::IsNullOrEmpty($taskEndpoint.UserInfo) -or
        -not [string]::IsNullOrEmpty($taskEndpoint.Query) -or
        -not [string]::IsNullOrEmpty($taskEndpoint.Fragment)) {
        throw 'BaseUrl must be an HTTP(S) endpoint without credentials, query parameters, or fragments.'
    }
}

$taskCliArgs = @($taskCliPath, 'edit', '--model', $Model)
foreach ($taskReferencePath in $taskReferencePaths) {
    $taskCliArgs += @('--image', $taskReferencePath)
}
$taskCliArgs += @(
    '--prompt-file', $taskPromptPath,
    '--quality', 'high', '--size', 'auto', '--output-format', 'png', '--no-augment',
    '--out', $taskOutputPath
)

if ($DryRun) {
    # Deliberately before any API key lookup, auth.json read, directory creation,
    # environment mutation, or Python invocation.
    $taskPrintedArgs = @($taskPythonPath) + $taskCliArgs
    [pscustomobject]@{
        Mode = 'dry-run; no API request and no credential read'
        BaseUrl = $(if ([string]::IsNullOrWhiteSpace($taskBaseUrl)) { 'CLI default' } else { $taskBaseUrl })
        Model = $Model
        DependencyPath = $taskDependencyPath
        Output = $taskOutputPath
        Command = '& ' + (($taskPrintedArgs | ForEach-Object { ConvertTo-PrintedArgument $_ }) -join ' ')
    }
    return
}

$taskChangedEnvironment = @{}
$taskApiKey = $null
$taskAuthData = $null
try {
    $taskApiKey = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'Process')
    if ([string]::IsNullOrWhiteSpace($taskApiKey)) {
        if (-not $UseCodexApiKey) {
            throw 'OPENAI_API_KEY is not configured. Set an authorized provider key locally, or use -UseCodexApiKey only after explicit authorization for this provider.'
        }
        $taskAuthPath = Join-Path -Path $taskCodexRoot -ChildPath 'auth.json'
        if (-not (Test-Path -LiteralPath $taskAuthPath -PathType Leaf)) {
            throw 'The authorized Codex auth file is unavailable. Configure an authorized provider key locally.'
        }
        try {
            $taskAuthData = Get-Content -LiteralPath $taskAuthPath -Raw | ConvertFrom-Json
            $taskApiKey = $taskAuthData.OPENAI_API_KEY
        }
        catch {
            throw 'Cannot read the authorized Codex API key. No credential values were printed.'
        }
        if ([string]::IsNullOrWhiteSpace($taskApiKey)) {
            throw 'The authorized Codex auth file has no OPENAI_API_KEY. OAuth-only credentials cannot be reused by this wrapper.'
        }
        $taskChangedEnvironment['OPENAI_API_KEY'] = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'Process')
        [Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $taskApiKey, 'Process')
    }

    if (-not [string]::IsNullOrWhiteSpace($BaseUrl)) {
        $taskChangedEnvironment['OPENAI_BASE_URL'] = [Environment]::GetEnvironmentVariable('OPENAI_BASE_URL', 'Process')
        [Environment]::SetEnvironmentVariable('OPENAI_BASE_URL', $taskBaseUrl, 'Process')
    }
    if ($taskDependencyPath) {
        $taskChangedEnvironment['PYTHONPATH'] = [Environment]::GetEnvironmentVariable('PYTHONPATH', 'Process')
        $taskPythonImportPath = $taskDependencyPath
        if (-not [string]::IsNullOrWhiteSpace($taskChangedEnvironment['PYTHONPATH'])) {
            $taskPythonImportPath += [IO.Path]::PathSeparator + $taskChangedEnvironment['PYTHONPATH']
        }
        [Environment]::SetEnvironmentVariable('PYTHONPATH', $taskPythonImportPath, 'Process')
    }
    $taskChangedEnvironment['PYTHONUTF8'] = [Environment]::GetEnvironmentVariable('PYTHONUTF8', 'Process')
    [Environment]::SetEnvironmentVariable('PYTHONUTF8', '1', 'Process')

    if (-not (Test-Path -LiteralPath $taskOutputParent -PathType Container)) {
        [IO.Directory]::CreateDirectory($taskOutputParent) | Out-Null
    }
    # Recheck after credential setup and immediately before dispatch.
    if (Test-Path -LiteralPath $taskOutputPath) {
        throw 'Output was created by another process. Choose a new versioned output path.'
    }

    # Argument arrays do not reinterpret model names or paths as shell code.
    & $taskPythonPath @taskCliArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Bundled imagegen CLI failed with exit code $LASTEXITCODE. No automatic retry or model substitution was performed."
    }
    if (-not (Test-Path -LiteralPath $taskOutputPath -PathType Leaf)) {
        throw 'The CLI completed without the expected output PNG. Inspect its returned paths before packaging.'
    }
}
finally {
    foreach ($taskVariableName in $taskChangedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($taskVariableName, $taskChangedEnvironment[$taskVariableName], 'Process')
    }
    $taskApiKey = $null
    $taskAuthData = $null
}
