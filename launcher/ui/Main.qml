import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: app
    visible: true; width: 1280; height: 800; minimumWidth: 980; minimumHeight: 640
    title: "BananaForge Launcher"
    color: "#10151f"
    property color accent: "#ff9f1c"
    property bool warningAcknowledged: false
    property int currentPage: 0
    property var pages: ["Home", "Mod Browser", "Installed Mods", "Profiles", "Instances", "Updates", "Diagnostics", "Downloads", "Settings", "About"]
    property var wizardSteps: ["Welcome", "Modding warning", "Detect BTD6", "Installation mode", "Managed location", "Copy or prepare", "MelonLoader", "BTD Mod Helper", "Dependencies", "First profile", "Test", "Finish"]

    Rectangle { anchors.fill: parent; gradient: Gradient { GradientStop { position: 0; color: "#10151f" } GradientStop { position: 1; color: "#172235" } } }
    RowLayout { anchors.fill: parent; spacing: 0
        Rectangle { Layout.fillHeight: true; Layout.preferredWidth: 238; color: "#121b2a"; border.color: "#2b3952"
            ColumnLayout { anchors.fill: parent; anchors.margins: 18; spacing: 8
                RowLayout { Layout.fillWidth: true; Layout.bottomMargin: 24
                    Rectangle { Layout.preferredWidth: 34; Layout.preferredHeight: 34; radius: 11; color: app.accent
                        Text { anchors.centerIn: parent; text: "◆"; font.pixelSize: 21; color: "#10151f" }
                    }
                    Label { text: "BANANAFORGE"; color: "#f4f7fb"; font.bold: true; font.pixelSize: 17 }
                }
                Repeater { model: app.pages
                    delegate: Button { id: navButton; required property int index; required property string modelData
                        Layout.fillWidth: true; text: modelData; checkable: true; checked: app.currentPage === index
                        onClicked: app.currentPage = index
                        contentItem: Text { text: navButton.text; color: navButton.checked ? "#10151f" : "#bdc8d9"; font.pixelSize: 14; verticalAlignment: Text.AlignVCenter; leftPadding: 14 }
                        background: Rectangle { radius: 10; color: navButton.checked ? app.accent : (navButton.hovered ? "#202d42" : "transparent") }
                    }
                }
                Item { Layout.fillHeight: true }
                Label { text: "Unofficial • No analytics"; color: "#71819b"; font.pixelSize: 11 }
            }
        }
        StackLayout { id: stack; Layout.fillWidth: true; Layout.fillHeight: true; currentIndex: app.currentPage
            Item { // Home
                ColumnLayout { anchors.fill: parent; anchors.margins: 36; spacing: 22
                    RowLayout { Layout.fillWidth: true
                        ColumnLayout { Label { text: "Good evening"; color: "#f6f8fc"; font.pixelSize: 32; font.bold: true } Label { text: "Your clean original installation remains separate."; color: "#aab8ca"; font.pixelSize: 15 } }
                        Item { Layout.fillWidth: true }
                        Button { text: "Check for updates" }
                    }
                    Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 220; radius: 22; color: "#1c2a40"; border.color: "#344765"
                        RowLayout { anchors.fill: parent; anchors.margins: 28
                            ColumnLayout { Layout.fillWidth: true; Label { text: "Ready for a managed setup"; color: "#f6f8fc"; font.pixelSize: 27; font.bold: true } Label { Layout.maximumWidth: 530; wrapMode: Text.WordWrap; text: "Create a separate modded instance, select a profile, and keep your original game untouched whenever the storefront supports it."; color: "#b9c6d8"; font.pixelSize: 15 }
                                RowLayout { Button { text: "Begin guided setup"; onClicked: wizard.open() } Button { text: "Launch clean" } }
                            }
                            Rectangle { Layout.preferredWidth: 150; Layout.preferredHeight: 150; radius: 75; color: "#273d5b"; border.color: app.accent; Text { anchors.centerIn: parent; text: "◆"; color: app.accent; font.pixelSize: 74 } }
                        }
                    }
                    GridLayout { columns: 3; Layout.fillWidth: true; rowSpacing: 14; columnSpacing: 14
                        Repeater { model: [["Instance", "No managed instance yet"], ["Profile", "Create your first profile"], ["Health", "Setup required"], ["Updates", "Check official sources"], ["Downloads", "No active downloads"], ["Recent activity", "Welcome to BananaForge"]]
                            delegate: Rectangle { required property var modelData; Layout.fillWidth: true; Layout.preferredHeight: 94; radius: 15; color: "#172338"; border.color: "#2b3952"; Column { anchors.fill: parent; anchors.margins: 15; spacing: 8; Label { text: modelData[0]; color: "#8292a9"; font.pixelSize: 12 } Label { text: modelData[1]; color: "#e9eef6"; font.pixelSize: 15; font.bold: true } } }
                        }
                    }
                }
            }
            Item { Column { anchors.centerIn: parent; spacing: 14; Label { text: "Official mod browser"; color: "white"; font.pixelSize: 30 } TextField { placeholderText: "Search official GitHub-based catalogue"; width: 500 } Button { text: "Search catalogue" } Label { text: "Search uses structured GitHub metadata. Ambiguous DLL releases always require your choice."; color: "#aab8ca" } } }
            Item { Label { anchors.centerIn: parent; text: "Installed Mods\nValidated files from your central Mod Library appear here."; horizontalAlignment: Text.AlignHCenter; color: "#dce5f2"; font.pixelSize: 22 } }
            Item { Label { anchors.centerIn: parent; text: "Profiles\nCreate, duplicate, import, export, and transactionally stage a profile."; horizontalAlignment: Text.AlignHCenter; color: "#dce5f2"; font.pixelSize: 22 } }
            Item { Label { anchors.centerIn: parent; text: "Instances\nManage copies separately from original store installations."; horizontalAlignment: Text.AlignHCenter; color: "#dce5f2"; font.pixelSize: 22 } }
            Item { Label { anchors.centerIn: parent; text: "Updates\nLauncher, bootstrap, game sync, MelonLoader, Mod Helper, and mod updates."; horizontalAlignment: Text.AlignHCenter; color: "#dce5f2"; font.pixelSize: 22 } }
            Item { Label { anchors.centerIn: parent; text: "Diagnostics\nValidation, logs, duplicate DLL detection, recovery journals, and redacted support bundle."; horizontalAlignment: Text.AlignHCenter; color: "#dce5f2"; font.pixelSize: 22 } }
            Item { Label { anchors.centerIn: parent; text: "Downloads\nVerified HTTPS downloads, progress, hashes, retry, cancellation, and cache controls."; horizontalAlignment: Text.AlignHCenter; color: "#dce5f2"; font.pixelSize: 22 } }
            Item { Column { anchors.centerIn: parent; spacing: 12; Label { text: "Appearance & accessibility"; color: "white"; font.pixelSize: 30 } ComboBox { model: ["Dark", "Light", "Follow system", "High contrast"] } ComboBox { model: ["Bloons orange", "Dart blue", "Purple", "Red", "Green", "Cyan", "Yellow", "Pink", "Neutral gray"] } CheckBox { text: "Reduced motion"; checked: false } Label { text: "Theme presets are importable/exportable and validated for contrast."; color: "#aab8ca" } } }
            Item { Label { anchors.centerIn: parent; text: "About BananaForge Launcher\nUnofficial and not affiliated with Ninja Kiwi. No analytics.\nUses official release metadata from GitHub, MelonLoader, and BTD Mod Helper."; horizontalAlignment: Text.AlignHCenter; color: "#dce5f2"; font.pixelSize: 20 } }
        }
    }
    Dialog { id: wizard; modal: true; anchors.centerIn: parent; width: 780; height: 560; title: "Guided setup"; property int step: 0
        background: Rectangle { radius: 20; color: "#18243a"; border.color: "#425778" }
        contentItem: ColumnLayout { spacing: 18
            ProgressBar { Layout.fillWidth: true; value: wizard.step / (app.wizardSteps.length - 1) }
            Label { text: app.wizardSteps[wizard.step]; color: "#f6f8fc"; font.pixelSize: 28; font.bold: true }
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; color: "#c3cfdf"; font.pixelSize: 15; text: wizard.step === 1 ? "BTD6 modding is unofficial. Mods can break after updates, crash the game, or corrupt saves. Do not use gameplay-changing mods in public multiplayer, races, leaderboards, ranked, or competitive modes. BananaForge does not bypass anti-cheat, DRM, licensing, ownership, paid content, or store authentication and cannot guarantee account safety. Back up your data." : "This setup step reports the files it changes, supports cancellation, and never claims success until validation completes." }
            CheckBox { visible: wizard.step === 1; text: "I understand and accept these risks"; onToggled: app.warningAcknowledged = checked }
            Item { Layout.fillHeight: true }
            RowLayout { Layout.alignment: Qt.AlignRight; Button { text: "Back"; enabled: wizard.step > 0; onClicked: wizard.step-- } Button { text: wizard.step === app.wizardSteps.length - 1 ? "Finish" : "Continue"; enabled: wizard.step !== 1 || app.warningAcknowledged; onClicked: wizard.step === app.wizardSteps.length - 1 ? wizard.close() : wizard.step++ } }
        }
    }
}
