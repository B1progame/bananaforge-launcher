import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: app
    visible: true
    width: 1360; height: 860
    minimumWidth: 1060; minimumHeight: 700
    title: "BananaForge Launcher"
    color: "#0b1220"

    property color accent: "#ffae2b"
    property color accentDark: "#d97810"
    property color ink: "#f8fafc"
    property color muted: "#9daec5"
    property color panel: "#121e31"
    property color panelRaised: "#17263d"
    property color stroke: "#2c405d"
    property bool warningAcknowledged: false
    property int currentPage: 0
    property var pages: ["Home", "Mod Browser", "Installed Mods", "Profiles", "Instances", "Updates", "Diagnostics", "Downloads", "Settings", "About"]
    property var pageIcons: ["⌂", "⌕", "▣", "◈", "▤", "↻", "⌁", "⇩", "⚙", "i"]
    property var wizardSteps: ["Welcome", "Safety", "Find BTD6", "Setup mode", "Install location", "Prepare game", "MelonLoader", "Mod Helper", "Dependencies", "Profile", "Test", "Finish"]

    Component.onCompleted: {
        if (openGuidedSetup)
            wizard.open()
    }

    component PrimaryButton: Button {
        id: control
        implicitHeight: 42
        padding: 18
        font.pixelSize: 14; font.weight: Font.DemiBold
        contentItem: Text { text: control.text; color: "#15100a"; font: control.font; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
        background: Rectangle {
            radius: 11
            color: !control.enabled ? "#62502d" : control.down ? app.accentDark : (control.hovered ? "#ffc15b" : app.accent)
            Behavior on color { ColorAnimation { duration: 120 } }
        }
    }

    component SecondaryButton: Button {
        id: control
        implicitHeight: 42
        padding: 18
        font.pixelSize: 14; font.weight: Font.DemiBold
        contentItem: Text { text: control.text; color: control.enabled ? app.ink : "#697991"; font: control.font; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
        background: Rectangle {
            radius: 11; color: control.down ? "#223550" : (control.hovered ? "#20334e" : "#18283f")
            border.color: control.hovered ? "#4b6b92" : app.stroke; border.width: 1
        }
    }

    component NavButton: Button {
        id: control
        property string glyph: ""
        implicitHeight: 43
        padding: 0
        contentItem: Row {
            leftPadding: 13; spacing: 12
            Text { width: 18; text: control.glyph; color: control.checked ? "#2a1805" : "#9fb2cd"; font.pixelSize: 18; horizontalAlignment: Text.AlignHCenter; anchors.verticalCenter: parent.verticalCenter }
            Text { text: control.text; color: control.checked ? "#211506" : "#b7c5d8"; font.pixelSize: 14; font.weight: control.checked ? Font.DemiBold : Font.Normal; anchors.verticalCenter: parent.verticalCenter }
        }
        background: Rectangle {
            radius: 10
            color: control.checked ? app.accent : (control.hovered ? "#1a2a42" : "transparent")
            Behavior on color { ColorAnimation { duration: 120 } }
        }
    }

    component StatCard: Rectangle {
        property string eyebrow: ""
        property string value: ""
        property string status: ""
        property color statusColor: app.accent
        Layout.fillWidth: true; Layout.preferredHeight: 123
        radius: 16; color: app.panel; border.color: app.stroke
        Column { anchors.fill: parent; anchors.margins: 17; spacing: 8
            Row { width: parent.width
                Text { text: eyebrow.toUpperCase(); color: "#7f95b4"; font.pixelSize: 11; font.weight: Font.DemiBold; font.letterSpacing: 1.1 }
                Item { width: parent.width - 80; height: 1 }
                Rectangle { width: 7; height: 7; radius: 4; color: statusColor; anchors.verticalCenter: parent.verticalCenter }
            }
            Text { text: value; color: app.ink; font.pixelSize: 16; font.weight: Font.DemiBold; elide: Text.ElideRight; width: parent.width }
            Text { text: status; color: app.muted; font.pixelSize: 12; elide: Text.ElideRight; width: parent.width }
        }
    }

    Rectangle { anchors.fill: parent; color: "#0c1422" }
    Rectangle { width: parent.width; height: 260; color: "#101d31"; opacity: 0.68 }

    RowLayout {
        anchors.fill: parent; spacing: 0

        Rectangle {
            Layout.fillHeight: true; Layout.preferredWidth: 254
            color: "#0e1929"; border.color: "#233852"; border.width: 1
            ColumnLayout {
                anchors.fill: parent; anchors.margins: 16; spacing: 4
                RowLayout {
                    Layout.fillWidth: true; Layout.bottomMargin: 27; Layout.topMargin: 7
                    Rectangle { Layout.preferredWidth: 38; Layout.preferredHeight: 38; radius: 12; color: app.accent
                        Text { anchors.centerIn: parent; text: "◆"; color: "#281704"; font.pixelSize: 22 }
                    }
                    Column { Layout.leftMargin: 9; spacing: 1
                        Text { text: "BANANA"; color: app.ink; font.pixelSize: 17; font.weight: Font.Black; font.letterSpacing: 0.8 }
                        Text { text: "FORGE LAUNCHER"; color: "#8fa4c0"; font.pixelSize: 9; font.weight: Font.DemiBold; font.letterSpacing: 1.2 }
                    }
                }
                Text { text: "WORKSPACE"; color: "#6f86a4"; font.pixelSize: 10; font.weight: Font.DemiBold; font.letterSpacing: 1.25; Layout.leftMargin: 12; Layout.bottomMargin: 5 }
                Repeater {
                    model: app.pages
                    delegate: NavButton {
                        required property int index
                        required property string modelData
                        Layout.fillWidth: true; text: modelData; glyph: app.pageIcons[index]
                        checkable: true; checked: app.currentPage === index
                        onClicked: app.currentPage = index
                    }
                }
                Item { Layout.fillHeight: true }
                Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#243851"; Layout.bottomMargin: 10 }
                Row { Layout.fillWidth: true; spacing: 8
                    Rectangle { width: 9; height: 9; radius: 5; color: "#55d6a5"; anchors.verticalCenter: parent.verticalCenter }
                    Text { text: "LOCAL MODE · NO ANALYTICS"; color: "#8297b2"; font.pixelSize: 10; font.weight: Font.DemiBold; font.letterSpacing: 0.7 }
                }
            }
        }

        StackLayout {
            Layout.fillWidth: true; Layout.fillHeight: true; currentIndex: app.currentPage
            Item {
                ColumnLayout { anchors.fill: parent; anchors.margins: 42; spacing: 24
                    RowLayout { Layout.fillWidth: true
                        ColumnLayout { spacing: 5
                            Text { text: "Your modding workspace"; color: app.ink; font.pixelSize: 32; font.weight: Font.Bold }
                            Text { text: "Set up BTD6 safely, keep your original install separate, and manage every mod in one place."; color: app.muted; font.pixelSize: 15 }
                        }
                        Item { Layout.fillWidth: true }
                        SecondaryButton { text: "↻  Check for updates" }
                    }

                    Rectangle {
                        Layout.fillWidth: true; Layout.preferredHeight: 254; radius: 22
                        color: "#172943"; border.color: "#3c587e"; border.width: 1
                        Rectangle { width: 6; height: parent.height - 42; radius: 3; color: app.accent; anchors.left: parent.left; anchors.leftMargin: 0; anchors.verticalCenter: parent.verticalCenter }
                        RowLayout { anchors.fill: parent; anchors.leftMargin: 34; anchors.rightMargin: 31; anchors.topMargin: 28; anchors.bottomMargin: 28; spacing: 22
                            ColumnLayout { Layout.fillWidth: true; spacing: 11
                                Row { spacing: 8
                                    Rectangle { width: 22; height: 22; radius: 11; color: "#29425f"; Text { anchors.centerIn: parent; text: "1"; color: app.accent; font.pixelSize: 12; font.weight: Font.Bold } }
                                    Text { text: "FIRST TIME HERE?"; color: "#a8bdd8"; font.pixelSize: 11; font.weight: Font.DemiBold; font.letterSpacing: 1.1; anchors.verticalCenter: parent.verticalCenter }
                                }
                                Text { text: "Create your first\nmanaged setup"; color: app.ink; font.pixelSize: 29; font.weight: Font.Bold; lineHeight: 0.95 }
                                Text { text: "The guided setup walks you through your game folder, a safe modded copy, and the tools you choose to download."; color: "#bdcbe0"; font.pixelSize: 14; wrapMode: Text.WordWrap; Layout.maximumWidth: 600 }
                                RowLayout { spacing: 10; Layout.topMargin: 4
                                    PrimaryButton { text: "Start guided setup  →"; onClicked: wizard.open() }
                                    SecondaryButton { text: "How it works" }
                                }
                            }
                            Rectangle { Layout.preferredWidth: 158; Layout.preferredHeight: 158; radius: 79; color: "#1b3554"; border.color: app.accent; border.width: 1
                                Rectangle { width: 88; height: 88; radius: 44; anchors.centerIn: parent; color: "#253f60" }
                                Text { anchors.centerIn: parent; text: "◆"; color: app.accent; font.pixelSize: 60 }
                            }
                        }
                    }
                    Text { text: "WORKSPACE STATUS"; color: "#7690b1"; font.pixelSize: 11; font.weight: Font.DemiBold; font.letterSpacing: 1.2; Layout.topMargin: 5 }
                    GridLayout { columns: 3; Layout.fillWidth: true; rowSpacing: 14; columnSpacing: 14
                        StatCard { eyebrow: "Game instance"; value: "No managed instance"; status: "Run guided setup to begin"; statusColor: "#ffae2b" }
                        StatCard { eyebrow: "Active profile"; value: "No profile selected"; status: "Profiles keep mod lists separate"; statusColor: "#7aa8ff" }
                        StatCard { eyebrow: "Safety check"; value: "Setup required"; status: "Original game remains untouched"; statusColor: "#ffae2b" }
                        StatCard { eyebrow: "Mod library"; value: "Ready when you are"; status: "Install only after you approve"; statusColor: "#55d6a5" }
                        StatCard { eyebrow: "Downloads"; value: "Nothing in progress"; status: "Verified sources and hashes"; statusColor: "#8f9bb0" }
                        StatCard { eyebrow: "Recent activity"; value: "Welcome to BananaForge"; status: "Your local workspace is ready"; statusColor: "#8f9bb0" }
                    }
                    Item { Layout.fillHeight: true }
                }
            }
            Item { PagePlaceholder { anchors.centerIn: parent; heading: "Mod browser"; description: "Browse the catalogue, review each source, then choose exactly what to download."; action: "Browse official catalogue" } }
            Item { PagePlaceholder { anchors.centerIn: parent; heading: "Installed mods"; description: "Inspect installed files, versions, conflicts, and update status for your active profile."; action: "Open Mod Library" } }
            Item { PagePlaceholder { anchors.centerIn: parent; heading: "Profiles"; description: "Use profiles to keep different mod combinations organized and reversible."; action: "Create profile" } }
            Item { PagePlaceholder { anchors.centerIn: parent; heading: "Instances"; description: "Your managed copy is separate from your original BTD6 install."; action: "Add instance" } }
            Item { PagePlaceholder { anchors.centerIn: parent; heading: "Updates"; description: "Review launcher, game, loader, helper, and mod updates before changing anything."; action: "Check for updates" } }
            Item { PagePlaceholder { anchors.centerIn: parent; heading: "Diagnostics"; description: "Run health checks, inspect logs, and create a redacted support bundle."; action: "Run health check" } }
            Item { PagePlaceholder { anchors.centerIn: parent; heading: "Downloads"; description: "Every download shows its source, progress, and verification result."; action: "View download history" } }
            Item { PagePlaceholder { anchors.centerIn: parent; heading: "Settings"; description: "Choose appearance, accessibility, library paths, and update preferences."; action: "Open settings" } }
            Item { PagePlaceholder { anchors.centerIn: parent; heading: "About BananaForge"; description: "Unofficial launcher for managing local BTD6 mod workspaces. No analytics."; action: "View project information" } }
        }
    }

    component PagePlaceholder: ColumnLayout {
        width: 620; spacing: 14
        property string heading: ""; property string description: ""; property string action: ""
        Rectangle { Layout.alignment: Qt.AlignHCenter; width: 72; height: 72; radius: 36; color: "#192d48"; border.color: "#42648e"; Text { anchors.centerIn: parent; text: "◆"; color: app.accent; font.pixelSize: 28 } }
        Text { Layout.alignment: Qt.AlignHCenter; text: heading; color: app.ink; font.pixelSize: 28; font.weight: Font.Bold }
        Text { Layout.alignment: Qt.AlignHCenter; text: description; color: app.muted; font.pixelSize: 15; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap; width: parent.width }
        SecondaryButton { Layout.alignment: Qt.AlignHCenter; text: action; Layout.topMargin: 8 }
    }

    Dialog {
        id: wizard
        modal: true; focus: true; closePolicy: Popup.CloseOnEscape
        anchors.centerIn: parent; width: Math.min(app.width - 80, 960); height: Math.min(app.height - 80, 650)
        padding: 0; property int step: 0
        background: Rectangle { radius: 20; color: "#111f33"; border.color: "#405d82"; border.width: 1 }
        contentItem: ColumnLayout {
            spacing: 0
            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 88; color: "#172a45"; radius: 20
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 20; color: "#172a45" }
                RowLayout { anchors.fill: parent; anchors.margins: 25
                    ColumnLayout { spacing: 4
                        Text { text: "GUIDED SETUP"; color: "#9cb4d3"; font.pixelSize: 10; font.weight: Font.DemiBold; font.letterSpacing: 1.2 }
                        Text { text: app.wizardSteps[wizard.step]; color: app.ink; font.pixelSize: 23; font.weight: Font.Bold }
                    }
                    Item { Layout.fillWidth: true }
                    Text { text: "STEP " + (wizard.step + 1) + " OF " + app.wizardSteps.length; color: "#b7c6db"; font.pixelSize: 11; font.weight: Font.DemiBold; font.letterSpacing: 0.8 }
                    ToolButton { id: closeButton; text: "×"; font.pixelSize: 25; onClicked: wizard.close(); contentItem: Text { text: closeButton.text; color: "#d4dfec"; font.pixelSize: 26; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter } }
                }
            }
            RowLayout { Layout.fillWidth: true; Layout.preferredHeight: 70; Layout.leftMargin: 27; Layout.rightMargin: 27; spacing: 6
                Repeater { model: app.wizardSteps.length
                    delegate: Rectangle { required property int index; Layout.fillWidth: true; Layout.preferredHeight: 5; radius: 3; color: index <= wizard.step ? app.accent : "#314762" }
                }
            }
            Item {
                Layout.fillWidth: true; Layout.fillHeight: true; Layout.leftMargin: 42; Layout.rightMargin: 42
                ColumnLayout { anchors.fill: parent; spacing: 16
                    Rectangle { Layout.preferredWidth: 58; Layout.preferredHeight: 58; radius: 17; color: wizard.step === 1 ? "#4b2c1b" : "#1c3554"; border.color: wizard.step === 1 ? "#d88239" : "#40648e"
                        Text { anchors.centerIn: parent; text: wizard.step === 1 ? "!" : "◆"; color: wizard.step === 1 ? "#ffbd74" : app.accent; font.pixelSize: 27; font.weight: Font.Bold }
                    }
                    Text { text: wizard.step === 1 ? "Before you continue" : (wizard.step === 0 ? "A clean, controlled start" : "We will guide you through this step"); color: app.ink; font.pixelSize: 27; font.weight: Font.Bold }
                    Text {
                        Layout.fillWidth: true; wrapMode: Text.WordWrap; color: "#bdcce0"; font.pixelSize: 15; lineHeight: 1.35
                        text: wizard.step === 0
                            ? (recommendedTools
                                ? "Your installer selected the recommended tools. After you choose a managed BTD6 folder, BananaForge will show the official GitHub releases and ask before downloading anything."
                                : "BananaForge will help you create a separate managed setup. Your original installation stays untouched whenever your storefront supports it.")
                            : wizard.step === 1
                              ? "BTD6 modding is unofficial. Mods can break after updates, crash the game, or affect saves. Never use gameplay-changing mods in public multiplayer, races, leaderboards, ranked, or competitive modes. BananaForge does not bypass anti-cheat, DRM, licensing, ownership, paid content, or store authentication."
                              : "This step will clearly show what it needs and will wait for your confirmation before making any changes or downloading anything."
                    }
                    Rectangle { visible: wizard.step === 0; Layout.fillWidth: true; Layout.preferredHeight: 72; radius: 13; color: "#172a43"; border.color: "#334f73"
                        Row { anchors.fill: parent; anchors.margins: 16; spacing: 13
                            Text { text: "✓"; color: "#55d6a5"; font.pixelSize: 21 }
                            Column { spacing: 3; Text { text: "You stay in control"; color: app.ink; font.pixelSize: 14; font.weight: Font.DemiBold } Text { text: "Downloads are shown first and require your approval."; color: app.muted; font.pixelSize: 12 } }
                        }
                    }
                    Rectangle { visible: wizard.step === 1; Layout.fillWidth: true; Layout.preferredHeight: 62; radius: 12; color: "#1a2d46"; border.color: warningAcknowledged ? "#477d70" : "#49617e"
                        Row { anchors.fill: parent; anchors.margins: 13; spacing: 12
                            CheckBox { id: riskCheck; checked: app.warningAcknowledged; onToggled: app.warningAcknowledged = checked
                                indicator: Rectangle { implicitWidth: 22; implicitHeight: 22; radius: 6; border.color: riskCheck.checked ? app.accent : "#7d91ab"; color: riskCheck.checked ? app.accent : "transparent"; Text { anchors.centerIn: parent; text: "✓"; visible: riskCheck.checked; color: "#241505"; font.weight: Font.Bold } }
                            }
                            Text { text: "I understand these risks and want to continue."; color: app.ink; font.pixelSize: 14; anchors.verticalCenter: parent.verticalCenter }
                        }
                    }
                    Item { Layout.fillHeight: true }
                }
            }
            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 84; color: "#14243a"; radius: 20
                Rectangle { anchors.top: parent.top; width: parent.width; height: 20; color: "#14243a" }
                RowLayout { anchors.fill: parent; anchors.margins: 22
                    Text { text: wizard.step === 1 && !app.warningAcknowledged ? "Acknowledge the warning to continue" : "You can go back at any time"; color: "#91a6c1"; font.pixelSize: 12 }
                    Item { Layout.fillWidth: true }
                    SecondaryButton { text: "←  Back"; enabled: wizard.step > 0; onClicked: wizard.step-- }
                    PrimaryButton { text: wizard.step === app.wizardSteps.length - 1 ? "Finish setup" : "Continue  →"; enabled: wizard.step !== 1 || app.warningAcknowledged; onClicked: wizard.step === app.wizardSteps.length - 1 ? wizard.close() : wizard.step++ }
                }
            }
        }
    }
}
