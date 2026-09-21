<#
    Preenche o nome do autor em todos os lugares e prepara o primeiro commit.

    O projeto sai do repositorio com o marcador `SEU-USUARIO` de proposito: o
    copyright e o link sao decisao de quem publica, nao deste codigo. Rode uma
    vez, com o seu usuario do GitHub:

        .\preparar-publicacao.ps1 -Usuario meu-usuario

    Ele NAO envia nada. O `git push` fica por sua conta, e o comando aparece no
    fim para voce conferir antes.
#>
param(
    [Parameter(Mandatory = $true)][string]$Usuario,
    [string]$Email = "",
    [string]$Repositorio = "nfs-heat-garagem"
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if ($Usuario -notmatch '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$') {
    throw "Usuario do GitHub invalido: '$Usuario'"
}
if (-not $Email) {
    # O endereco de no-reply do GitHub nao expoe o e-mail real nos commits.
    $Email = "$Usuario@users.noreply.github.com"
}

# 1. troca o marcador em todo arquivo de texto rastreado
$alvos = @("LICENSE", "nfsgaragem\config.py")
foreach ($a in $alvos) {
    $txt = Get-Content -Raw -Encoding utf8 $a
    $novo = $txt -replace 'SEU-USUARIO', $Usuario
    if ($novo -ne $txt) {
        # NAO usar `Set-Content -Encoding utf8`: no PowerShell 5.1 isso escreve
        # BOM, e um BOM no LICENSE atrapalha a deteccao de licenca do GitHub.
        [System.IO.File]::WriteAllText((Resolve-Path $a), $novo, (New-Object System.Text.UTF8Encoding $false))
        Write-Output "preenchido: $a"
    }
}

# 2. identidade do git, so' neste repositorio
git config user.name $Usuario
git config user.email $Email
Write-Output "autor: $Usuario <$Email>"

# 3. confere que nenhum arquivo de jogo entrou
$sujeira = git ls-files | Where-Object { $_ -match '\.(obj|mtl|png|jpg|dds|fbx|csv|key)$' }
if ($sujeira) { throw "arquivo de dado de jogo no indice:`n$($sujeira -join "`n")" }
Write-Output "nenhum arquivo de jogo no indice"

# 4. primeiro commit
git add -A
$msg = @'
Garagem 3D para os veiculos do NFS Heat

Codigo apenas: nenhum modelo, textura ou peca do jogo acompanha o
repositorio. O acervo sai da copia legitima de quem usa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
'@
git commit -m $msg
Write-Output ""
Write-Output "Commit feito. Nada foi enviado. Para publicar:"
Write-Output "    gh repo create $Repositorio --public --source . --remote origin"
Write-Output "    git push -u origin main"
