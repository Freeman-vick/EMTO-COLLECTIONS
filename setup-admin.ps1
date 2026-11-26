$ErrorActionPreference = 'Stop'
$securePassword = Read-Host 'Create an admin password (at least 16 characters)' -AsSecureString
$confirmPassword = Read-Host 'Enter it again to confirm' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$confirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmPassword)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $plainConfirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPointer)
    if ($plainPassword.Length -lt 16) {
        throw 'Password must be at least 16 characters long.'
    }
    if ($plainPassword -cne $plainConfirmation) {
        throw 'The passwords do not match. Run setup again.'
    }
    $encodedPassword = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($plainPassword))
    $configPath = Join-Path $PSScriptRoot '.env.local'
    [IO.File]::WriteAllText($configPath, "EMTO_ADMIN_PASSWORD_B64=$encodedPassword`r`n", [Text.UTF8Encoding]::new($false))
    Write-Host 'Admin password saved locally. Keep this folder private.' -ForegroundColor Green
    Write-Host 'Start the shop with: node server.js'
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($confirmPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPointer)
    }
    $plainPassword = $null
    $plainConfirmation = $null
}
