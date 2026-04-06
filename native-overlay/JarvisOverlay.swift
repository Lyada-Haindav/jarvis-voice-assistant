import AppKit
import Foundation

struct OverlayPayload: Decodable {
    var assistantName: String?
    var title: String?
    var subtitle: String?
    var note: String?
    var quickHint: String?
    var listening: Bool?
    var speaking: Bool?
    var awake: Bool?
    var expanded: Bool?
    var visible: Bool?
}

struct MediaSnapshot: Equatable {
    let source: String
    let title: String
    let artist: String
    let state: String

    var isPlaying: Bool {
        state.lowercased() == "playing"
    }

    var displayText: String {
        let cleanedSource = source.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedArtist = artist.trimmingCharacters(in: .whitespacesAndNewlines)

        if !cleanedTitle.isEmpty && !cleanedArtist.isEmpty {
            return "\(cleanedSource)  \u{2022}  \(cleanedTitle) - \(cleanedArtist)"
        }

        if !cleanedTitle.isEmpty {
            return "\(cleanedSource)  \u{2022}  \(cleanedTitle)"
        }

        return cleanedSource
    }
}

final class CapsuleButton: NSButton {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        isBordered = false
        bezelStyle = .regularSquare
        focusRingType = .none
        wantsLayer = true
        layer?.cornerRadius = 14
        layer?.borderWidth = 1
        font = NSFont.systemFont(ofSize: 11, weight: .semibold)
        imagePosition = .imageOnly
    }

    required init?(coder: NSCoder) {
        return nil
    }

    override func layout() {
        super.layout()
        layer?.cornerRadius = bounds.height / 2
    }

    func apply(primary: NSColor, emphasized: Bool = false) {
        contentTintColor = primary
        layer?.backgroundColor = primary.withAlphaComponent(emphasized ? 0.22 : 0.12).cgColor
        layer?.borderColor = primary.withAlphaComponent(emphasized ? 0.42 : 0.22).cgColor
    }
}

final class CapsuleContentView: NSView {
    private let glowLayer = CAGradientLayer()
    private let shellLayer = CAGradientLayer()
    private let sheenLayer = CAGradientLayer()
    private let borderLayer = CAShapeLayer()
    private let dividerLayer = CALayer()
    private let orbGlowLayer = CAGradientLayer()
    private let orbRingLayer = CAShapeLayer()
    private let orbCoreLayer = CAGradientLayer()
    private let pulseLayer = CAShapeLayer()
    private let badgeBackgroundLayer = CAGradientLayer()

    private let titleField = NSTextField(labelWithString: "Jarvis")
    private let subtitleField = NSTextField(labelWithString: "Say Hey Jarvis")
    private let noteField = NSTextField(labelWithString: "Background wake mode is ready.")
    private let modeBadge = NSTextField(labelWithString: "IDLE")
    private let hintField = NSTextField(labelWithString: "Click to open")
    private let previousButton = CapsuleButton(frame: .zero)
    private let playPauseButton = CapsuleButton(frame: .zero)
    private let nextButton = CapsuleButton(frame: .zero)

    private var trackingAreaRef: NSTrackingArea?
    private var subtitleRevealTimer: Timer?
    private var subtitleWords: [String] = []
    private var subtitleTargetText = ""
    private var subtitleWordIndex = 0
    private var hoverExpanded = false

    var onOpenHost: (() -> Void)?
    var onHoverChanged: ((Bool) -> Void)?
    var onPreviousTrack: (() -> Void)?
    var onPlayPause: (() -> Void)?
    var onNextTrack: (() -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.masksToBounds = false
        setupLayers()
        setupLabels()
        setupButtons()
    }

    required init?(coder: NSCoder) {
        return nil
    }

    deinit {
        subtitleRevealTimer?.invalidate()
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingAreaRef {
            removeTrackingArea(trackingAreaRef)
        }

        let options: NSTrackingArea.Options = [.mouseEnteredAndExited, .activeAlways, .inVisibleRect]
        let area = NSTrackingArea(rect: bounds, options: options, owner: self, userInfo: nil)
        addTrackingArea(area)
        trackingAreaRef = area
    }

    override func mouseEntered(with event: NSEvent) {
        onHoverChanged?(true)
        super.mouseEntered(with: event)
    }

    override func mouseExited(with event: NSEvent) {
        onHoverChanged?(false)
        super.mouseExited(with: event)
    }

    override func mouseDown(with event: NSEvent) {
        onOpenHost?()
        super.mouseDown(with: event)
    }

    override func layout() {
        super.layout()
        guard let container = layer else { return }

        let radius = bounds.height / 2
        container.cornerRadius = radius
        container.shadowColor = NSColor.black.withAlphaComponent(0.45).cgColor
        container.shadowOpacity = 1
        container.shadowRadius = hoverExpanded ? 28 : 22
        container.shadowOffset = CGSize(width: 0, height: -7)

        glowLayer.frame = bounds.insetBy(dx: -30, dy: -26)
        glowLayer.cornerRadius = glowLayer.bounds.height / 2

        shellLayer.frame = bounds
        shellLayer.cornerRadius = radius

        sheenLayer.frame = bounds
        sheenLayer.cornerRadius = radius

        let insetBounds = bounds.insetBy(dx: 0.75, dy: 0.75)
        borderLayer.frame = bounds
        borderLayer.path = CGPath(
            roundedRect: insetBounds,
            cornerWidth: radius,
            cornerHeight: radius,
            transform: nil
        )

        let orbSide = max(54, min(bounds.height - 26, 76))
        let orbFrame = CGRect(x: 20, y: (bounds.height - orbSide) / 2, width: orbSide, height: orbSide)
        orbGlowLayer.frame = orbFrame.insetBy(dx: -14, dy: -14)
        orbGlowLayer.cornerRadius = orbGlowLayer.bounds.width / 2
        orbRingLayer.frame = orbFrame
        orbRingLayer.path = CGPath(ellipseIn: orbRingLayer.bounds.insetBy(dx: 2, dy: 2), transform: nil)
        orbCoreLayer.frame = orbFrame.insetBy(dx: 10, dy: 10)
        orbCoreLayer.cornerRadius = orbCoreLayer.bounds.width / 2
        pulseLayer.frame = orbFrame.insetBy(dx: -4, dy: -4)
        pulseLayer.path = CGPath(ellipseIn: pulseLayer.bounds.insetBy(dx: 2, dy: 2), transform: nil)

        let dividerX = orbFrame.maxX + 18
        dividerLayer.frame = CGRect(x: dividerX, y: 18, width: 1, height: max(0, bounds.height - 36))

        let badgeWidth = max(104, min(144, bounds.width * 0.19))
        let badgeHeight: CGFloat = 28
        let badgeX = bounds.width - badgeWidth - 20
        let badgeY = bounds.height - badgeHeight - 18
        badgeBackgroundLayer.frame = CGRect(x: badgeX, y: badgeY, width: badgeWidth, height: badgeHeight)
        badgeBackgroundLayer.cornerRadius = badgeHeight / 2
        modeBadge.frame = badgeBackgroundLayer.frame

        let textLeading = dividerX + 20
        let textTrailing = badgeX - 18
        titleField.frame = CGRect(x: textLeading, y: bounds.height - 32, width: max(0, textTrailing - textLeading), height: 16)
        subtitleField.frame = CGRect(x: textLeading, y: bounds.height - 62, width: max(0, textTrailing - textLeading), height: 25)

        let mediaControlsVisible = !previousButton.isHidden || !playPauseButton.isHidden || !nextButton.isHidden
        let controlsWidth = mediaControlsVisible ? 142 : 0
        noteField.frame = CGRect(x: textLeading, y: 18, width: max(0, bounds.width - textLeading - CGFloat(controlsWidth) - 98), height: 18)
        hintField.frame = CGRect(x: bounds.width - 100, y: 18, width: 72, height: 16)

        if mediaControlsVisible {
            let buttonY = 14.0
            previousButton.frame = CGRect(x: bounds.width - 168, y: buttonY, width: 42, height: 28)
            playPauseButton.frame = CGRect(x: bounds.width - 118, y: buttonY, width: 42, height: 28)
            nextButton.frame = CGRect(x: bounds.width - 68, y: buttonY, width: 42, height: 28)
        }
    }

    func apply(payload: OverlayPayload, media: MediaSnapshot?, hoverExpanded: Bool) {
        self.hoverExpanded = hoverExpanded

        let assistantName = payload.assistantName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = payload.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let subtitle = payload.subtitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let note = payload.note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let quickHint = payload.quickHint?.trimmingCharacters(in: .whitespacesAndNewlines)

        titleField.attributedStringValue = styledEyebrow(assistantName?.isEmpty == false ? assistantName! : "JARVIS")
        updateAnimatedSubtitle(subtitle?.isEmpty == false ? subtitle! : (title?.isEmpty == false ? title! : "Say Hey Jarvis"))

        let mediaText = media?.displayText.trimmingCharacters(in: .whitespacesAndNewlines)
        noteField.stringValue = mediaText?.isEmpty == false ? mediaText! : (note?.isEmpty == false ? note! : "Background wake mode is ready.")

        let listening = payload.listening ?? false
        let speaking = payload.speaking ?? false
        let awake = payload.awake ?? false
        let stateStyle = overlayStyle(listening: listening, speaking: speaking, awake: awake)

        glowLayer.colors = [
            stateStyle.primary.withAlphaComponent(stateStyle.glowAlpha).cgColor,
            stateStyle.secondary.withAlphaComponent(0.02).cgColor
        ]
        shellLayer.colors = [
            NSColor(calibratedRed: 0.015, green: 0.018, blue: 0.032, alpha: 0.985).cgColor,
            NSColor(calibratedRed: 0.025, green: 0.04, blue: 0.075, alpha: 0.995).cgColor,
            NSColor(calibratedRed: 0.022, green: 0.015, blue: 0.04, alpha: 0.99).cgColor
        ]
        sheenLayer.colors = [
            NSColor.white.withAlphaComponent(0.18).cgColor,
            NSColor.white.withAlphaComponent(0.035).cgColor,
            NSColor.clear.cgColor
        ]
        borderLayer.strokeColor = stateStyle.primary.withAlphaComponent(0.56).cgColor
        dividerLayer.backgroundColor = NSColor.white.withAlphaComponent(0.08).cgColor

        orbGlowLayer.colors = [
            stateStyle.primary.withAlphaComponent(0.34).cgColor,
            stateStyle.secondary.withAlphaComponent(0.04).cgColor
        ]
        orbRingLayer.strokeColor = stateStyle.primary.withAlphaComponent(0.96).cgColor
        orbRingLayer.fillColor = NSColor.clear.cgColor
        orbRingLayer.lineWidth = speaking ? 2.4 : listening ? 2.0 : 1.6
        orbCoreLayer.colors = [
            stateStyle.primary.withAlphaComponent(0.98).cgColor,
            stateStyle.secondary.withAlphaComponent(0.82).cgColor
        ]
        pulseLayer.strokeColor = stateStyle.primary.withAlphaComponent(0.46).cgColor
        pulseLayer.fillColor = NSColor.clear.cgColor
        pulseLayer.lineWidth = 1.5

        badgeBackgroundLayer.colors = [
            stateStyle.primary.withAlphaComponent(0.22).cgColor,
            stateStyle.secondary.withAlphaComponent(0.12).cgColor
        ]

        subtitleField.textColor = NSColor(calibratedWhite: 0.985, alpha: 0.99)
        noteField.textColor = mediaText?.isEmpty == false ? stateStyle.primary.withAlphaComponent(0.92) : NSColor(calibratedWhite: 0.78, alpha: 0.88)
        modeBadge.stringValue = stateStyle.badgeText
        modeBadge.textColor = stateStyle.primary
        hintField.textColor = stateStyle.primary.withAlphaComponent(0.82)
        hintField.stringValue = quickHint?.isEmpty == false ? quickHint! : "Click to open"

        let showMediaControls = media != nil && (hoverExpanded || (payload.expanded ?? false) || speaking || listening)
        previousButton.isHidden = !showMediaControls
        playPauseButton.isHidden = !showMediaControls
        nextButton.isHidden = !showMediaControls
        if let media {
            let playImageName = media.isPlaying ? NSImage.touchBarPauseTemplateName : NSImage.touchBarPlayTemplateName
            previousButton.image = NSImage(named: NSImage.touchBarRewindTemplateName)
            playPauseButton.image = NSImage(named: playImageName)
            nextButton.image = NSImage(named: NSImage.touchBarFastForwardTemplateName)
            previousButton.toolTip = "Previous track"
            playPauseButton.toolTip = media.isPlaying ? "Pause" : "Play"
            nextButton.toolTip = "Next track"
        }
        previousButton.apply(primary: stateStyle.primary)
        playPauseButton.apply(primary: stateStyle.primary, emphasized: media?.isPlaying ?? false)
        nextButton.apply(primary: stateStyle.primary)

        applyAnimations(style: stateStyle)
        needsLayout = true
    }

    @objc private func handlePlayPause() {
        onPlayPause?()
    }

    @objc private func handlePreviousTrack() {
        onPreviousTrack?()
    }

    @objc private func handleNextTrack() {
        onNextTrack?()
    }

    private func setupLayers() {
        guard let container = layer else { return }
        glowLayer.startPoint = CGPoint(x: 0.08, y: 0.24)
        glowLayer.endPoint = CGPoint(x: 0.92, y: 0.82)
        container.addSublayer(glowLayer)

        shellLayer.startPoint = CGPoint(x: 0, y: 0.5)
        shellLayer.endPoint = CGPoint(x: 1, y: 0.5)
        container.addSublayer(shellLayer)

        sheenLayer.startPoint = CGPoint(x: 0.1, y: 1)
        sheenLayer.endPoint = CGPoint(x: 0.9, y: 0)
        container.addSublayer(sheenLayer)

        borderLayer.fillColor = NSColor.black.withAlphaComponent(0.02).cgColor
        borderLayer.lineWidth = 1.2
        container.addSublayer(borderLayer)

        dividerLayer.cornerRadius = 0.5
        container.addSublayer(dividerLayer)

        orbGlowLayer.startPoint = CGPoint(x: 0.2, y: 0.2)
        orbGlowLayer.endPoint = CGPoint(x: 0.8, y: 0.8)
        container.addSublayer(orbGlowLayer)
        container.addSublayer(pulseLayer)
        container.addSublayer(orbRingLayer)
        orbCoreLayer.startPoint = CGPoint(x: 0.12, y: 0.12)
        orbCoreLayer.endPoint = CGPoint(x: 0.88, y: 0.88)
        container.addSublayer(orbCoreLayer)
        container.addSublayer(badgeBackgroundLayer)
    }

    private func setupLabels() {
        titleField.backgroundColor = .clear
        titleField.translatesAutoresizingMaskIntoConstraints = false

        subtitleField.font = NSFont.systemFont(ofSize: 21, weight: .semibold)
        subtitleField.lineBreakMode = .byTruncatingTail
        subtitleField.maximumNumberOfLines = 1
        subtitleField.translatesAutoresizingMaskIntoConstraints = false
        subtitleField.backgroundColor = .clear

        noteField.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        noteField.lineBreakMode = .byTruncatingTail
        noteField.maximumNumberOfLines = 1
        noteField.translatesAutoresizingMaskIntoConstraints = false
        noteField.backgroundColor = .clear

        modeBadge.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .semibold)
        modeBadge.alignment = .center
        modeBadge.translatesAutoresizingMaskIntoConstraints = false
        modeBadge.backgroundColor = .clear

        hintField.font = NSFont.systemFont(ofSize: 11, weight: .semibold)
        hintField.alignment = .right
        hintField.translatesAutoresizingMaskIntoConstraints = false
        hintField.backgroundColor = .clear

        addSubview(titleField)
        addSubview(subtitleField)
        addSubview(noteField)
        addSubview(modeBadge)
        addSubview(hintField)
    }

    private func setupButtons() {
        previousButton.isHidden = true
        previousButton.target = self
        previousButton.action = #selector(handlePreviousTrack)
        playPauseButton.isHidden = true
        playPauseButton.target = self
        playPauseButton.action = #selector(handlePlayPause)
        nextButton.isHidden = true
        nextButton.target = self
        nextButton.action = #selector(handleNextTrack)
        addSubview(previousButton)
        addSubview(playPauseButton)
        addSubview(nextButton)
    }

    private func styledEyebrow(_ text: String) -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .left
        return NSAttributedString(
            string: text.uppercased(),
            attributes: [
                .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .bold),
                .foregroundColor: NSColor(calibratedWhite: 0.74, alpha: 0.95),
                .kern: 1.4,
                .paragraphStyle: paragraph
            ]
        )
    }

    private func updateAnimatedSubtitle(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == subtitleTargetText {
            return
        }

        subtitleTargetText = trimmed
        subtitleRevealTimer?.invalidate()
        subtitleWords = trimmed.split(separator: " ").map(String.init)
        subtitleWordIndex = 0
        subtitleField.stringValue = ""

        guard !subtitleWords.isEmpty else {
            return
        }

        if subtitleWords.count <= 2 {
            subtitleField.stringValue = trimmed
            animateSubtitleTransition()
            return
        }

        animateSubtitleTransition()
        let timer = Timer.scheduledTimer(withTimeInterval: 0.04, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }

            self.subtitleWordIndex += 1
            let visible = self.subtitleWords.prefix(self.subtitleWordIndex).joined(separator: " ")
            self.subtitleField.stringValue = visible

            if self.subtitleWordIndex >= self.subtitleWords.count {
                timer.invalidate()
                self.subtitleRevealTimer = nil
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        subtitleRevealTimer = timer
    }

    private func animateSubtitleTransition() {
        let transition = CATransition()
        transition.type = .fade
        transition.duration = 0.16
        subtitleField.layer?.add(transition, forKey: "subtitleFade")
    }

    private func overlayStyle(listening: Bool, speaking: Bool, awake: Bool) -> (primary: NSColor, secondary: NSColor, badgeText: String, glowAlpha: CGFloat, animationKey: String) {
        if speaking {
            return (
                NSColor(calibratedRed: 0.47, green: 0.94, blue: 1.0, alpha: 1.0),
                NSColor(calibratedRed: 0.19, green: 0.56, blue: 0.95, alpha: 1.0),
                "SPEAKING",
                0.36,
                "speak"
            )
        }

        if listening {
            return (
                NSColor(calibratedRed: 0.34, green: 1.0, blue: 0.78, alpha: 1.0),
                NSColor(calibratedRed: 0.06, green: 0.64, blue: 0.54, alpha: 1.0),
                "LISTENING",
                0.30,
                "listen"
            )
        }

        if awake {
            return (
                NSColor(calibratedRed: 0.80, green: 0.89, blue: 1.0, alpha: 1.0),
                NSColor(calibratedRed: 0.32, green: 0.41, blue: 0.94, alpha: 1.0),
                "AWAKE",
                0.22,
                "awake"
            )
        }

        return (
            NSColor(calibratedRed: 0.71, green: 0.77, blue: 0.88, alpha: 1.0),
            NSColor(calibratedRed: 0.20, green: 0.25, blue: 0.36, alpha: 1.0),
            "READY",
            0.14,
            "idle"
        )
    }

    private func applyAnimations(style: (primary: NSColor, secondary: NSColor, badgeText: String, glowAlpha: CGFloat, animationKey: String)) {
        orbGlowLayer.removeAllAnimations()
        pulseLayer.removeAllAnimations()
        orbCoreLayer.removeAllAnimations()

        let glowPulse = CABasicAnimation(keyPath: "opacity")
        glowPulse.fromValue = style.animationKey == "speak" ? 0.58 : style.animationKey == "listen" ? 0.42 : 0.22
        glowPulse.toValue = style.animationKey == "speak" ? 1.0 : style.animationKey == "listen" ? 0.76 : 0.36
        glowPulse.duration = style.animationKey == "speak" ? 0.72 : style.animationKey == "listen" ? 1.05 : 1.9
        glowPulse.autoreverses = true
        glowPulse.repeatCount = .infinity
        orbGlowLayer.add(glowPulse, forKey: "glowPulse")

        let scalePulse = CABasicAnimation(keyPath: "transform.scale")
        scalePulse.fromValue = 0.92
        scalePulse.toValue = style.animationKey == "speak" ? 1.16 : style.animationKey == "listen" ? 1.1 : 1.04
        scalePulse.duration = style.animationKey == "speak" ? 0.62 : style.animationKey == "listen" ? 0.94 : 1.8
        scalePulse.autoreverses = true
        scalePulse.repeatCount = .infinity
        pulseLayer.add(scalePulse, forKey: "scalePulse")

        let coreBreath = CABasicAnimation(keyPath: "transform.scale")
        coreBreath.fromValue = 0.96
        coreBreath.toValue = style.animationKey == "speak" ? 1.08 : 1.03
        coreBreath.duration = style.animationKey == "speak" ? 0.54 : 1.2
        coreBreath.autoreverses = true
        coreBreath.repeatCount = .infinity
        orbCoreLayer.add(coreBreath, forKey: "coreBreath")
    }
}

final class OverlayPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class MediaController {
    var onChange: ((MediaSnapshot?) -> Void)?
    private var timer: Timer?
    private var currentSnapshot: MediaSnapshot?

    func start() {
        refresh()
        let timer = Timer.scheduledTimer(withTimeInterval: 1.8, repeats: true) { [weak self] _ in
            self?.refresh()
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func togglePlayPause() {
        runControlScript([
            "if application \"Spotify\" is running then",
            "  tell application \"Spotify\" to playpause",
            "else if application \"Music\" is running then",
            "  tell application \"Music\" to playpause",
            "end if"
        ])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) { [weak self] in
            self?.refresh()
        }
    }

    func nextTrack() {
        runControlScript([
            "if application \"Spotify\" is running then",
            "  tell application \"Spotify\" to next track",
            "else if application \"Music\" is running then",
            "  tell application \"Music\" to next track",
            "end if"
        ])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) { [weak self] in
            self?.refresh()
        }
    }

    func previousTrack() {
        runControlScript([
            "if application \"Spotify\" is running then",
            "  tell application \"Spotify\" to previous track",
            "else if application \"Music\" is running then",
            "  tell application \"Music\" to previous track",
            "end if"
        ])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) { [weak self] in
            self?.refresh()
        }
    }

    private func refresh() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self else { return }
            let snapshot = self.fetchSnapshot()
            DispatchQueue.main.async {
                if snapshot != self.currentSnapshot {
                    self.currentSnapshot = snapshot
                    self.onChange?(snapshot)
                }
            }
        }
    }

    private func fetchSnapshot() -> MediaSnapshot? {
        let scriptLines = [
            "if application \"Spotify\" is running then",
            "  tell application \"Spotify\"",
            "    if player state is playing or player state is paused then",
            "      return \"Spotify||\" & (name of current track) & \"||\" & (artist of current track) & \"||\" & (player state as text)",
            "    end if",
            "  end tell",
            "end if",
            "if application \"Music\" is running then",
            "  tell application \"Music\"",
            "    if player state is playing or player state is paused then",
            "      return \"Music||\" & (name of current track) & \"||\" & (artist of current track) & \"||\" & (player state as text)",
            "    end if",
            "  end tell",
            "end if",
            "return \"\""
        ]

        guard let output = runAppleScript(scriptLines)?.trimmingCharacters(in: .whitespacesAndNewlines), !output.isEmpty else {
            return nil
        }

        let pieces = output.components(separatedBy: "||")
        guard pieces.count >= 4 else {
            return nil
        }

        return MediaSnapshot(
            source: pieces[0],
            title: pieces[1],
            artist: pieces[2],
            state: pieces[3]
        )
    }

    private func runControlScript(_ lines: [String]) {
        DispatchQueue.global(qos: .utility).async {
            _ = self.runAppleScript(lines)
        }
    }

    private func runAppleScript(_ lines: [String]) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = lines.flatMap { ["-e", $0] }
        let outputPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = Pipe()

        do {
            try process.run()
        } catch {
            return nil
        }

        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            return nil
        }

        let data = outputPipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)
    }
}

final class OverlayController {
    private let panel: OverlayPanel
    private let contentView: CapsuleContentView
    private let hostAppPath: String?
    private let mediaController = MediaController()
    private var lastSize: CGSize = .zero
    private var latestPayload = OverlayPayload()
    private var mediaSnapshot: MediaSnapshot?
    private var hoverExpanded = false

    init(hostAppPath: String?) {
        self.hostAppPath = hostAppPath
        self.contentView = CapsuleContentView(frame: NSRect(x: 0, y: 0, width: 560, height: 98))
        self.panel = OverlayPanel(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 98),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        panel.level = .statusBar
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isMovable = false
        panel.isMovableByWindowBackground = false
        panel.ignoresMouseEvents = false
        panel.contentView = contentView
        panel.orderFrontRegardless()

        contentView.onOpenHost = { [weak self] in
            self?.openHostApp()
        }
        contentView.onHoverChanged = { [weak self] hovering in
            self?.setHoverExpanded(hovering)
        }
        contentView.onPreviousTrack = { [weak self] in
            self?.mediaController.previousTrack()
        }
        contentView.onPlayPause = { [weak self] in
            self?.mediaController.togglePlayPause()
        }
        contentView.onNextTrack = { [weak self] in
            self?.mediaController.nextTrack()
        }

        mediaController.onChange = { [weak self] snapshot in
            self?.mediaSnapshot = snapshot
            self?.refresh(animated: true)
        }
        mediaController.start()
    }

    func apply(payload: OverlayPayload) {
        latestPayload = payload
        refresh(animated: lastSize != .zero)
    }

    func openHostFromMenu() {
        openHostApp()
    }

    private func refresh(animated: Bool) {
        let payloadExpanded = latestPayload.expanded ?? false
        let shouldExpand = payloadExpanded || hoverExpanded
        contentView.apply(payload: latestPayload, media: mediaSnapshot, hoverExpanded: hoverExpanded)

        let targetSize = CGSize(
            width: shouldExpand ? 760 : (mediaSnapshot == nil ? 560 : 600),
            height: shouldExpand ? 126 : 98
        )
        let shouldShow = (latestPayload.visible ?? latestPayload.awake ?? latestPayload.listening ?? latestPayload.speaking ?? false) || mediaSnapshot != nil
        resizeAndPosition(size: targetSize, animated: animated)

        if shouldShow {
            panel.animator().alphaValue = 1.0
            panel.orderFrontRegardless()
        } else {
            panel.animator().alphaValue = 0.0
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                guard let self else { return }
                if self.panel.alphaValue <= 0.05 {
                    self.panel.orderOut(nil)
                }
            }
        }
    }

    private func setHoverExpanded(_ hovering: Bool) {
        hoverExpanded = hovering
        refresh(animated: true)
    }

    private func resizeAndPosition(size: CGSize, animated: Bool) {
        guard let screen = currentScreen() else { return }
        let frame = screen.frame
        let x = frame.midX - size.width / 2
        let y = frame.maxY - size.height - 8
        let targetFrame = NSRect(x: x, y: y, width: size.width, height: size.height)

        if animated {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.24
                context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                panel.animator().setFrame(targetFrame, display: true)
            }
        } else {
            panel.setFrame(targetFrame, display: true)
        }

        lastSize = size
    }

    private func currentScreen() -> NSScreen? {
        let mouseLocation = NSEvent.mouseLocation
        return NSScreen.screens.first(where: { $0.frame.contains(mouseLocation) }) ?? NSScreen.main ?? NSScreen.screens.first
    }

    private func openHostApp() {
        guard let hostAppPath = resolvedHostAppPath() else { return }
        let hostURL = URL(fileURLWithPath: hostAppPath)
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        NSWorkspace.shared.openApplication(at: hostURL, configuration: configuration, completionHandler: nil)
    }

    private func resolvedHostAppPath() -> String? {
        if let hostAppPath, !hostAppPath.isEmpty, FileManager.default.fileExists(atPath: hostAppPath) {
            return hostAppPath
        }

        let bundleURL = URL(fileURLWithPath: Bundle.main.bundlePath)
        let candidate = bundleURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .path

        return FileManager.default.fileExists(atPath: candidate) ? candidate : nil
    }
}

final class OverlayStateMonitor {
    private let stateURL: URL
    private let applyState: (OverlayPayload) -> Void
    private var lastModified: Date = .distantPast
    private var timer: Timer?

    init(stateURL: URL, applyState: @escaping (OverlayPayload) -> Void) {
        self.stateURL = stateURL
        self.applyState = applyState
    }

    func start() {
        loadStateIfNeeded(force: true)
        timer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
            self?.loadStateIfNeeded(force: false)
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func loadStateIfNeeded(force: Bool) {
        let values = try? stateURL.resourceValues(forKeys: [.contentModificationDateKey])
        let modified = values?.contentModificationDate ?? .distantPast
        if !force && modified <= lastModified {
            return
        }

        lastModified = modified

        guard let data = try? Data(contentsOf: stateURL) else { return }
        guard let payload = try? JSONDecoder().decode(OverlayPayload.self, from: data) else { return }
        applyState(payload)
    }
}

@main
final class JarvisOverlayApplication: NSObject, NSApplicationDelegate {
    private var controller: OverlayController?
    private var monitor: OverlayStateMonitor?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        let hostAppPath = ProcessInfo.processInfo.environment["JARVIS_HOST_APP_PATH"]
        let controller = OverlayController(hostAppPath: hostAppPath)
        self.controller = controller
        installStatusItem()

        if let statePath = ProcessInfo.processInfo.environment["JARVIS_OVERLAY_STATE_PATH"], !statePath.isEmpty {
            let monitor = OverlayStateMonitor(stateURL: URL(fileURLWithPath: statePath)) { payload in
                controller.apply(payload: payload)
            }
            self.monitor = monitor
            monitor.start()
        } else {
            controller.apply(payload: OverlayPayload(
                assistantName: "Jarvis",
                title: "Jarvis",
                subtitle: "Say Hey Jarvis",
                note: "Overlay is ready.",
                listening: false,
                speaking: false,
                awake: false,
                expanded: false,
                visible: true
            ))
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    private func installStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            button.title = "J"
            button.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .bold)
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Open Jarvis", action: #selector(openJarvisFromMenu), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit Overlay", action: #selector(quitOverlay), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item
    }

    @objc private func openJarvisFromMenu() {
        controller?.openHostFromMenu()
    }

    @objc private func quitOverlay() {
        NSApp.terminate(nil)
    }
}
