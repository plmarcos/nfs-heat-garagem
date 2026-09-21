# Extrai a ficha tecnica de cada veiculo do EBX de ajuste do Need for Speed Heat
# e grava `_ficha_tecnica.csv` na raiz do acervo. Roda uma vez.
#
#     powershell -ExecutionPolicy Bypass -File extrair_ficha.ps1 `
#         -Jogo "F:\SteamLibrary\steamapps\common\Need for Speed Heat" `
#         -Frosty "...\FrostyEditor" -Acervo "F:\CarsNfSHeat"
#
# De onde vem cada numero (conferido no Car_BMW_M3E46_2003, que bate com o carro
# real: 1495 kg, entre-eixos 2,736 m):
#   RaceVehicleChassisConfigData      Mass, WheelBase, TrackWidthFront/Rear, FrontAxle
#   RaceVehicleEngineConfigData       Torque (curva), RedLine, MaxRpm, Idle
#   RaceVehicleTransmissionConfigData TopGear, FinalGear, DifferentialFront/Rear
#
# A curva de torque e' uma lista de 10 Vec3 no formato do Frostbite:
#   [0] = (rpm minimo, torque minimo, -)
#   [1] = (rpm maximo, torque maximo, -)
#   [2..9] = pontos normalizados (t em 0..1, valor em 0..1, tangente)
# Entao torque(rpm) = yMin + (yMax - yMin) * curva(t), com t = (rpm-xMin)/(xMax-xMin).

param(
  [string]$Jogo    = $(if ($env:NFSHEAT_JOGO) { $env:NFSHEAT_JOGO }
                       else { 'F:\SteamLibrary\steamapps\common\Need for Speed Heat' }),
  [string]$Frosty  = $(if ($env:FROSTY_EDITOR) { $env:FROSTY_EDITOR }
                       else { 'F:\SteamLibrary\steamapps\common\NFS Heat Music Modding\FrostyEditor\FrostyEditor' }),
  [string]$Acervo  = $(if ($env:NFSHEAT_ACERVO) { $env:NFSHEAT_ACERVO } else { 'F:\CarsNfSHeat' }),
  # O Export.cs nao mora neste repositorio: ele e' do nfs-heat-car-tools, que
  # e' quem faz a extracao. O padrao procura ao lado deste script; se voce
  # clonou so' a garagem, aponte com -Export para a copia de la'.
  [string]$Export  = $(Join-Path $PSScriptRoot 'Export.cs')
)
$ErrorActionPreference = 'Stop'

# Falhar aqui, com o caminho na mensagem, e' melhor que falhar la' dentro com
# um "nao foi possivel carregar o assembly", que nao diz nada a ninguem.
if (-not (Test-Path (Join-Path $Frosty 'FrostySdk.dll'))) {
  throw "FrostySdk.dll nao encontrado em '$Frosty'. Defina FROSTY_EDITOR ou use -Frosty."
}
if (-not (Test-Path $Jogo))   { throw "Pasta do jogo nao encontrada em '$Jogo'. Defina NFSHEAT_JOGO ou use -Jogo." }
if (-not (Test-Path $Acervo)) { throw "Acervo nao encontrado em '$Acervo'. Defina NFSHEAT_ACERVO ou use -Acervo." }
if (-not (Test-Path $Export)) {
  throw "Export.cs nao encontrado em '$Export'. Ele vem do repositorio nfs-heat-car-tools; aponte com -Export."
}

Set-Location $Frosty
[System.IO.Directory]::SetCurrentDirectory($Frosty)
$resolver = [System.ResolveEventHandler]{
  param($s, $e)
  $n = $e.Name.Split(',')[0]
  if ($n -eq 'EbxClasses') { return [Reflection.Assembly]::LoadFrom((Join-Path $Frosty 'Profiles\NFSHEATSDK.dll')) }
  foreach ($d in @('', 'ThirdParty\', 'Plugins\')) {
    $p = Join-Path $Frosty "$d$n.dll"
    if (Test-Path $p) { return [Reflection.Assembly]::LoadFrom($p) }
  }
  return $null
}
[AppDomain]::CurrentDomain.add_AssemblyResolve($resolver)
$refs = @((Join-Path $Frosty 'FrostySdk.dll'), (Join-Path $Frosty 'Plugins\MeshSetPlugin.dll'),
          (Join-Path $Frosty 'Plugins\TexturePlugin.dll'), 'System.dll', 'System.Core.dll', 'System.Drawing.dll')
Add-Type -TypeDefinition (Get-Content $Export -Raw) -ReferencedAssemblies $refs -Language CSharp
Write-Host ([HeatTool.Boot]::Init('NeedForSpeedHeat', $Jogo, (Join-Path $Frosty 'NFSHEAT.key')))

# --- indice de tudo que esta' sob Vehicles/Tuning ---------------------------
$tuning = @{}
foreach ($e in [HeatTool.Boot]::Am.EnumerateEbx('')) {
  if ($e.Name -notmatch '^vehicles/tuning/([^/]+)/(.+)$') { continue }
  $pasta = $Matches[1]
  if (-not $tuning.ContainsKey($pasta)) { $tuning[$pasta] = @{} }
  $tuning[$pasta][$e.Type] = $e.Name
}
Write-Host "pastas de ajuste encontradas: $($tuning.Count)"

function Prop($obj, [string]$nome) {
  if ($null -eq $obj) { return $null }
  $p = $obj.GetType().GetProperty($nome)
  if ($null -eq $p) { return $null }
  return $p.GetValue($obj)
}

function Raiz([string]$nome) {
  if (-not $nome) { return $null }
  $e = [HeatTool.Boot]::Am.GetEbxEntry($nome)
  if (-not $e) { return $null }
  try { return ([HeatTool.Boot]::Am.GetEbx($e)).RootObject } catch { return $null }
}

# Avalia a curva do Frostbite num t de 0 a 1, por interpolacao linear entre os
# pontos normalizados. As tangentes existem no dado mas linear ja' da' menos de
# 1% de diferenca no pico, que e' o que interessa aqui.
function CurvaEm($pontos, [double]$t) {
  if ($pontos.Count -lt 3) { return 0.0 }
  $ant = $pontos[2]
  for ($i = 2; $i -lt $pontos.Count; $i++) {
    $p = $pontos[$i]
    if ($p.x -ge $t) {
      if ($p.x -eq $ant.x) { return [double]$p.y }
      $f = ($t - $ant.x) / ($p.x - $ant.x)
      return [double]($ant.y + ($p.y - $ant.y) * $f)
    }
    $ant = $p
  }
  return [double]$ant.y
}

$linhas = New-Object System.Collections.ArrayList
$comProblema = New-Object System.Collections.ArrayList

foreach ($pasta in ($tuning.Keys | Sort-Object)) {
  $mapa = $tuning[$pasta]
  $motor   = Raiz $mapa['RaceVehicleEngineConfigData']
  $chassi  = Raiz $mapa['RaceVehicleChassisConfigData']
  $cambio  = Raiz $mapa['RaceVehicleTransmissionConfigData']
  if (-not $motor -and -not $chassi) { [void]$comProblema.Add($pasta); continue }

  $massa      = Prop $chassi 'Mass'
  $entreEixos = Prop $chassi 'WheelBase'
  $bitolaF    = Prop $chassi 'TrackWidthFront'
  $bitolaT    = Prop $chassi 'TrackWidthRear'
  $eixoF      = Prop $chassi 'FrontAxle'

  $redline = Prop $motor 'RedLine'
  $rpmMax  = Prop $motor 'MaxRpm'
  $marcha  = Prop $motor 'Idle'

  $tqPico = 0.0; $rpmTqPico = 0; $hpPico = 0.0; $rpmHpPico = 0; $curva = ''
  $pontos = Prop $motor 'Torque'
  if ($pontos -and $pontos.Count -ge 3) {
    $rpmMin = [double]$pontos[0].x; $vMin = [double]$pontos[0].y
    $rpmTop = [double]$pontos[1].x; $vMax = [double]$pontos[1].y
    $faixa = $rpmTop - $rpmMin
    $amostras = New-Object System.Collections.ArrayList
    # Varre de 250 em 250 rpm ate' o corte (o redline manda; sem ele, o topo da curva)
    $corte = if ($redline -and $redline -gt $rpmMin) { [double]$redline } else { $rpmTop }
    for ($rpm = $rpmMin; $rpm -le $corte; $rpm += 250) {
      $t = if ($faixa -gt 0) { ($rpm - $rpmMin) / $faixa } else { 0 }
      $tq = $vMin + ($vMax - $vMin) * (CurvaEm $pontos $t)
      $hp = $tq * $rpm / 7127.0     # N.m x rpm -> cv metrico
      if ($tq -gt $tqPico) { $tqPico = $tq; $rpmTqPico = [int]$rpm }
      if ($hp -gt $hpPico) { $hpPico = $hp; $rpmHpPico = [int]$rpm }
      [void]$amostras.Add(("{0}:{1:N0}" -f [int]$rpm, $tq))
    }
    $curva = ($amostras -join '|')
  }

  $difF = [double](Prop $cambio 'DifferentialFront')
  $difT = [double](Prop $cambio 'DifferentialRear')
  $tracao = if ($difF -gt 0 -and $difT -gt 0) { 'integral' }
            elseif ($difF -gt 0) { 'dianteira' }
            elseif ($difT -gt 0) { 'traseira' }
            else { '' }

  [void]$linhas.Add([pscustomobject]@{
    carro            = $pasta
    massa_kg         = if ($massa) { [math]::Round([double]$massa) } else { '' }
    entre_eixos_m    = if ($entreEixos) { [math]::Round([double]$entreEixos, 3) } else { '' }
    bitola_f_m       = if ($bitolaF) { [math]::Round([double]$bitolaF, 3) } else { '' }
    bitola_t_m       = if ($bitolaT) { [math]::Round([double]$bitolaT, 3) } else { '' }
    eixo_f_m         = if ($eixoF) { [math]::Round([double]$eixoF, 3) } else { '' }
    potencia_cv      = if ($hpPico -gt 0) { [math]::Round($hpPico) } else { '' }
    rpm_potencia     = if ($hpPico -gt 0) { $rpmHpPico } else { '' }
    torque_nm        = if ($tqPico -gt 0) { [math]::Round($tqPico) } else { '' }
    rpm_torque       = if ($tqPico -gt 0) { $rpmTqPico } else { '' }
    redline          = if ($redline) { [int]$redline } else { '' }
    rpm_max          = if ($rpmMax) { [int]$rpmMax } else { '' }
    marcha_lenta     = if ($marcha) { [int]$marcha } else { '' }
    marchas          = if ($cambio) { [int](Prop $cambio 'TopGear') } else { '' }
    relacao_final    = if ($cambio) { [math]::Round([double](Prop $cambio 'FinalGear'), 2) } else { '' }
    tracao           = $tracao
    curva_torque     = $curva
  })
}

$saida = Join-Path $Acervo '_ficha_tecnica.csv'
$linhas | Export-Csv -Path $saida -NoTypeInformation -Encoding UTF8
Write-Host ""
Write-Host "fichas gravadas: $($linhas.Count)  ->  $saida"
if ($comProblema.Count -gt 0) {
  Write-Host "sem motor nem chassi: $($comProblema.Count)"
  $comProblema | Select-Object -First 10 | ForEach-Object { Write-Host "   $_" }
}
$comCv = ($linhas | Where-Object { $_.potencia_cv -ne '' }).Count
Write-Host "com potencia: $comCv de $($linhas.Count)"
