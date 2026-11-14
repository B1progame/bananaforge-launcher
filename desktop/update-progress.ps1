$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="BananaForge Update" Width="590" Height="355"
        WindowStartupLocation="CenterScreen" WindowStyle="None"
        ResizeMode="NoResize" ShowInTaskbar="True" Topmost="True"
        AllowsTransparency="True" Background="Transparent">
  <Window.Resources>
    <LinearGradientBrush x:Key="AccentBrush" StartPoint="0,0" EndPoint="1,0">
      <GradientStop Color="#F1A958" Offset="0"/>
      <GradientStop Color="#E8C15D" Offset="0.45"/>
      <GradientStop Color="#78C8AC" Offset="1"/>
    </LinearGradientBrush>
    <LinearGradientBrush x:Key="SweepBrush" StartPoint="0,0" EndPoint="1,0">
      <GradientStop Color="#00FFFFFF" Offset="0"/>
      <GradientStop Color="#C8FFF1C4" Offset="0.5"/>
      <GradientStop Color="#00FFFFFF" Offset="1"/>
    </LinearGradientBrush>
    <Style TargetType="Button">
      <Setter Property="Foreground" Value="#ECEEF2"/>
      <Setter Property="Background" Value="#2B2D32"/>
      <Setter Property="BorderBrush" Value="#484B53"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="Padding" Value="14,8"/>
      <Setter Property="FontFamily" Value="Segoe UI"/>
      <Setter Property="FontSize" Value="12"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}"
                    BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="8" Padding="{TemplateBinding Padding}">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>
  <Border Background="#17191D" BorderBrush="#45434A" BorderThickness="1" CornerRadius="18">
    <Grid>
      <Grid.RowDefinitions><RowDefinition Height="4"/><RowDefinition Height="*"/></Grid.RowDefinitions>
      <Border Grid.Row="0" Background="{StaticResource AccentBrush}" CornerRadius="18,18,0,0"/>
      <Grid Grid.Row="1" Margin="26,20,26,22">
        <Grid.RowDefinitions>
          <RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/>
          <RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        <Grid Grid.Row="0">
          <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
            <Border Width="34" Height="34" CornerRadius="11" Background="#302B21" Margin="0,0,10,0">
              <TextBlock Text="BF" Foreground="#F1C66E" FontSize="14" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <StackPanel VerticalAlignment="Center">
              <TextBlock Text="BananaForge" Foreground="#F2F1EC" FontFamily="Segoe UI" FontSize="13" FontWeight="SemiBold"/>
              <TextBlock Text="VERIFIED DESKTOP UPDATE" Foreground="#A5AAA8" FontFamily="Segoe UI" FontSize="9" FontWeight="Bold"/>
            </StackPanel>
          </StackPanel>
          <Button x:Name="HideButton" Content="Hide" HorizontalAlignment="Right" VerticalAlignment="Center" Padding="10,6"/>
        </Grid>
        <StackPanel Grid.Row="1" Margin="0,24,0,18">
          <TextBlock x:Name="TitleText" Text="Updating BananaForge" Foreground="#F4F3EF" FontFamily="Segoe UI" FontSize="24" FontWeight="SemiBold"/>
          <TextBlock x:Name="VersionText" Text="Installing the verified update" Foreground="#AEB2BA" FontFamily="Segoe UI" FontSize="12" Margin="0,5,0,0"/>
        </StackPanel>
        <Grid Grid.Row="2" Margin="0,0,0,16">
          <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="*"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
          <TextBlock x:Name="VerifiedStep" Grid.Column="0" Text="01  VERIFIED" Foreground="#8FD4B3" FontFamily="Segoe UI" FontSize="10" FontWeight="Bold"/>
          <TextBlock x:Name="InstallStep" Grid.Column="1" Text="02  INSTALLING" Foreground="#F0C46A" FontFamily="Segoe UI" FontSize="10" FontWeight="Bold" HorizontalAlignment="Center"/>
          <TextBlock x:Name="RelaunchStep" Grid.Column="2" Text="03  REOPEN" Foreground="#737780" FontFamily="Segoe UI" FontSize="10" FontWeight="Bold" HorizontalAlignment="Right"/>
        </Grid>
        <Border x:Name="ProgressTrack" Grid.Row="3" Height="10" Background="#0E1012" BorderBrush="#383A40" BorderThickness="1" CornerRadius="8" ClipToBounds="True">
          <Grid ClipToBounds="True">
            <Border x:Name="ProgressFill" Width="0" HorizontalAlignment="Left" Background="{StaticResource AccentBrush}" CornerRadius="8"/>
            <Border x:Name="ProgressSweep" Width="116" HorizontalAlignment="Left" Background="{StaticResource SweepBrush}" Opacity="0"/>
          </Grid>
        </Border>
        <StackPanel Grid.Row="4" Margin="0,13,0,0">
          <TextBlock x:Name="StatusText" Text="Preparing a safe handoff to the installer…" Foreground="#E1E2E5" FontFamily="Segoe UI" FontSize="12"/>
          <TextBlock x:Name="HintText" Text="The installer checksum has been verified. Your profiles and game files stay in place." Foreground="#92969F" FontFamily="Segoe UI" FontSize="10" Margin="0,5,0,0" TextWrapping="Wrap"/>
        </StackPanel>
        <StackPanel Grid.Row="5" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,18,0,0">
          <Button x:Name="RetryButton" Content="Retry install" Visibility="Collapsed" Margin="0,0,8,0"/>
          <Button x:Name="OpenAppButton" Content="Open BananaForge" Visibility="Collapsed" Background="#34362F"/>
        </StackPanel>
      </Grid>
    </Grid>
  </Border>
</Window>
'@

$script:Window = [System.Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
$script:TitleText = $script:Window.FindName('TitleText')
$script:VersionText = $script:Window.FindName('VersionText')
$script:VerifiedStep = $script:Window.FindName('VerifiedStep')
$script:InstallStep = $script:Window.FindName('InstallStep')
$script:RelaunchStep = $script:Window.FindName('RelaunchStep')
$script:StatusText = $script:Window.FindName('StatusText')
$script:HintText = $script:Window.FindName('HintText')
$script:ProgressTrack = $script:Window.FindName('ProgressTrack')
$script:ProgressFill = $script:Window.FindName('ProgressFill')
$script:ProgressSweep = $script:Window.FindName('ProgressSweep')
$script:HideButton = $script:Window.FindName('HideButton')
$script:RetryButton = $script:Window.FindName('RetryButton')
$script:OpenAppButton = $script:Window.FindName('OpenAppButton')
$script:InstallerProcess = $null
$script:WaitingForParent = $true
$script:Finished = $false
$script:WaitStartedAt = Get-Date
$script:SweepTransform = New-Object System.Windows.Media.TranslateTransform
$script:ProgressSweep.RenderTransform = $script:SweepTransform

$script:VersionText.Text = "BananaForge $script:UpdateVersion · verified installer"
$script:HideButton.Add_Click({ $script:Window.Hide() })

function Start-ProgressSweep {
  $script:ProgressFill.Width = 0
  $script:ProgressSweep.Opacity = 0.95
  $animation = New-Object System.Windows.Media.Animation.DoubleAnimation
  $animation.From = -125
  $animation.To = $script:ProgressTrack.ActualWidth + 125
  $animation.Duration = [System.Windows.Duration]::new([TimeSpan]::FromSeconds(1.25))
  $animation.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
  $script:SweepTransform.BeginAnimation([System.Windows.Media.TranslateTransform]::XProperty, $animation)
}

function Set-InstallFailure([string]$message) {
  $script:ProgressTimer.Stop()
  $script:TitleText.Text = 'The update could not finish'
  $script:InstallStep.Foreground = [System.Windows.Media.Brushes]::IndianRed
  $script:StatusText.Text = $message
  $script:HintText.Text = 'Your verified installer is still saved. You can retry it or reopen BananaForge.'
  $script:ProgressSweep.Opacity = 0
  $script:SweepTransform.BeginAnimation([System.Windows.Media.TranslateTransform]::XProperty, $null)
  $script:ProgressFill.Width = 0
  $script:RetryButton.Visibility = 'Visible'
  $script:OpenAppButton.Visibility = 'Visible'
}

function Start-VerifiedInstaller {
  try {
    $script:RetryButton.Visibility = 'Collapsed'
    $script:OpenAppButton.Visibility = 'Collapsed'
    $script:WaitingForParent = $false
    $script:TitleText.Text = 'Installing BananaForge'
    $script:InstallStep.Foreground = [System.Windows.Media.Brushes]::Khaki
    $script:StatusText.Text = 'Replacing the app files with the verified update…'
    $script:HintText.Text = 'This step can take a little while. The progress animation stays active while Windows installs the update.'
    Start-ProgressSweep
    $script:InstallerProcess = Start-Process -FilePath $script:SetupPath -ArgumentList $script:InstallArguments -WorkingDirectory (Split-Path -LiteralPath $script:SetupPath) -PassThru
  } catch {
    Set-InstallFailure "Could not start the installer: $($_.Exception.Message)"
  }
}

$script:RetryButton.Add_Click({
  Start-VerifiedInstaller
  if ($script:InstallerProcess -and -not $script:InstallerProcess.HasExited) { $script:ProgressTimer.Start() }
})
$script:OpenAppButton.Add_Click({
  try {
    $script:Finished = $true
    Start-Process -FilePath $script:AppPath -WorkingDirectory (Split-Path -LiteralPath $script:AppPath)
    $script:Window.Close()
  } catch { Set-InstallFailure "BananaForge could not be reopened: $($_.Exception.Message)" }
})
$script:Window.Add_Closing({
  param($sender, $eventArgs)
  if (-not $script:Finished) { $eventArgs.Cancel = $true; $script:Window.Hide() }
})

$script:ProgressTimer = New-Object System.Windows.Threading.DispatcherTimer
$script:ProgressTimer.Interval = [TimeSpan]::FromMilliseconds(350)
$script:ProgressTimer.Add_Tick({
  if ($script:WaitingForParent) {
    $launcher = Get-Process -Id $script:ParentProcessId -ErrorAction SilentlyContinue
    if ($launcher) {
      if (((Get-Date) - $script:WaitStartedAt).TotalSeconds -gt 35) {
        Set-InstallFailure 'BananaForge is still closing. Close it normally, then retry the verified installer.'
      }
      return
    }
    Start-VerifiedInstaller
    return
  }
  if ($script:InstallerProcess -and $script:InstallerProcess.HasExited) {
    $script:ProgressTimer.Stop()
    if ($script:InstallerProcess.ExitCode -ne 0) {
      Set-InstallFailure "Windows installer exited with code $($script:InstallerProcess.ExitCode)."
      return
    }
    $script:TitleText.Text = 'Update installed'
    $script:InstallStep.Foreground = [System.Windows.Media.Brushes]::LightGreen
    $script:RelaunchStep.Foreground = [System.Windows.Media.Brushes]::Khaki
    $script:StatusText.Text = 'Relaunching BananaForge…'
    $script:HintText.Text = 'Your new version is ready. This window will close automatically.'
    $script:ProgressSweep.Opacity = 0
    $script:SweepTransform.BeginAnimation([System.Windows.Media.TranslateTransform]::XProperty, $null)
    $script:ProgressFill.Width = $script:ProgressTrack.ActualWidth
    $script:Finished = $true
    $script:RelaunchTimer = New-Object System.Windows.Threading.DispatcherTimer
    $script:RelaunchTimer.Interval = [TimeSpan]::FromMilliseconds(900)
    $script:RelaunchTimer.Add_Tick({
      $script:RelaunchTimer.Stop()
      try {
        Start-Process -FilePath $script:AppPath -WorkingDirectory (Split-Path -LiteralPath $script:AppPath)
        $script:Window.Close()
      } catch {
        $script:Finished = $false
        Set-InstallFailure "The update installed, but BananaForge could not reopen: $($_.Exception.Message)"
      }
    })
    $script:RelaunchTimer.Start()
  }
})

$script:Window.Show()
$script:Window.Activate() | Out-Null
Start-ProgressSweep
$script:ProgressTimer.Start()
try { [System.Windows.Threading.Dispatcher]::Run() }
finally { Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue }
