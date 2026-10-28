param([switch]$Disable)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskReceipt = Join-Path $taskRoot 'profile/runtime/lan-firewall.json'
$taskRuleName = 'Semanote-Agent-Web-LAN'
$taskGroup = 'Semanote-Agent'
try {
    $taskPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator authorization is required to configure Windows Firewall.' }
    $taskExisting = Get-NetFirewallRule -Name $taskRuleName -ErrorAction SilentlyContinue
    if ($taskExisting -and $taskExisting.Group -ne $taskGroup) { throw 'An unrelated rule owns this name; no firewall rule was modified.' }
    if ($Disable) {
        if ($taskExisting) { Disable-NetFirewallRule -Name $taskRuleName | Out-Null }
        @{ status='disabled'; ruleName=$taskRuleName } | ConvertTo-Json | Set-Content -LiteralPath $taskReceipt -Encoding utf8
        exit 0
    }
    $taskConfig = Get-Content -LiteralPath (Join-Path $taskRoot 'profile/runtime/local-config.json') -Raw | ConvertFrom-Json
    if ($taskConfig.networkMode -ne 'lan' -or -not $taskConfig.lanInterfaces) { throw 'Enable LAN mode in local_web.py before configuring its firewall rule.' }
    $taskAddresses = @($taskConfig.lanInterfaces | ForEach-Object { $_.address })
    $taskSubnets = @($taskConfig.lanInterfaces | ForEach-Object { $_.subnet })
    $taskAliases = @($taskConfig.lanInterfaces | ForEach-Object { $_.interfaceAlias })
    $taskJava = (Get-Command java.exe -ErrorAction Stop).Source
    $taskParameters = @{
        Direction='Inbound'; Action='Allow'; Enabled='True'; Profile='Any';
        Protocol='TCP'; LocalPort=8080; LocalAddress=$taskAddresses;
        RemoteAddress=$taskSubnets; InterfaceAlias=$taskAliases;
        Program=$taskJava; EdgeTraversalPolicy='Block'
    }
    if ($taskExisting) { Set-NetFirewallRule -Name $taskRuleName @taskParameters | Out-Null }
    else { New-NetFirewallRule -Name $taskRuleName -DisplayName 'Semanote Web (LAN TCP 8080)' -Group $taskGroup -Description ('Project-scoped LAN access for ' + $taskRoot) @taskParameters | Out-Null }
    @{ status='enabled'; ruleName=$taskRuleName; localAddresses=$taskAddresses; remoteSubnets=$taskSubnets; port=8080 } | ConvertTo-Json | Set-Content -LiteralPath $taskReceipt -Encoding utf8
} catch {
    @{ status='failed'; message=$_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath $taskReceipt -Encoding utf8
    throw
}
