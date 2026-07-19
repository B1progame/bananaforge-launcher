import QtQuick
import QtQuick.Controls
ApplicationWindow {
  visible: true; width: 1100; height: 720; minimumWidth: 800; minimumHeight: 600; title: "BananaForge Launcher"
  color: "#10151f"
  Column { anchors.centerIn: parent; spacing: 20; width: 640
    Label { text: "BANANAFORGE"; font.pixelSize: 48; font.bold: true; color: "#ffad33"; anchors.horizontalCenter: parent.horizontalCenter }
    Label { text: "A safer home for your managed BTD6 mod instance"; font.pixelSize: 20; color: "#d7e1ef"; anchors.horizontalCenter: parent.horizontalCenter }
    Rectangle { width: parent.width; height: 190; radius: 18; color: "#1b2638"
      Text { anchors.centerIn: parent; width: parent.width - 48; wrapMode: Text.WordWrap; horizontalAlignment: Text.AlignHCenter; color: "#d7e1ef"; font.pixelSize: 16; text: "Modding is unofficial and can break after updates, crash the game, or corrupt saves. Avoid gameplay-changing mods in competitive or public online modes. BananaForge never bypasses DRM, anti-cheat, ownership checks, or storefront authentication, and cannot guarantee account safety." }
    }
    Button { text: "Begin guided setup"; anchors.horizontalCenter: parent.horizontalCenter; font.pixelSize: 18 }
  }
}
