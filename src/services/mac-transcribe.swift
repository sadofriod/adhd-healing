import Foundation
import Speech

enum TranscriptionCliError: LocalizedError {
  case missingInputPath
  case invalidArguments(String)
  case unsupportedLocale(String)
  case recognizerUnavailable(String)
  case authorizationDenied(String)
  case timeout
  case noTranscriptionResult
  case emptyTranscription

  var errorDescription: String? {
    switch self {
    case .missingInputPath:
      return "Missing --input <audio-path> argument"
    case let .invalidArguments(message):
      return message
    case let .unsupportedLocale(localeIdentifier):
      return "Unsupported speech locale: \(localeIdentifier)"
    case let .recognizerUnavailable(localeIdentifier):
      return "Speech recognizer is unavailable for locale: \(localeIdentifier)"
    case let .authorizationDenied(status):
      return "Speech recognition authorization failed: \(status)"
    case .timeout:
      return "Speech transcription timed out"
    case .noTranscriptionResult:
      return "Speech transcription returned no result"
    case .emptyTranscription:
      return "Speech transcription returned empty text"
    }
  }
}

enum CliCommand {
  case check(localeIdentifier: String?, outputPath: String?)
  case transcribe(inputPath: String, localeIdentifier: String?, outputPath: String?)
}

struct CheckPayload: Encodable {
  let status: String
  let locale: String
}

struct TranscriptionPayload: Encodable {
  let text: String
}

struct ErrorPayload: Encodable {
  let error: String
}

func writeStandardError(_ message: String) {
  FileHandle.standardError.write(Data((message + "\n").utf8))
}

func emitJson<T: Encodable>(_ value: T, outputPath: String?) throws {
  let encoder = JSONEncoder()
  let data = try encoder.encode(value)

  if let outputPath {
    try data.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
    return
  }

  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
}

func emitError(_ message: String, outputPath: String?) {
  writeStandardError(message)
  try? emitJson(ErrorPayload(error: message), outputPath: outputPath)
}

func parseCommand(arguments: [String]) throws -> CliCommand {
  var localeIdentifier: String?
  var inputPath: String?
  var outputPath: String?
  var isCheck = false

  var index = 0
  while index < arguments.count {
    let argument = arguments[index]

    switch argument {
    case "--check":
      isCheck = true
      index += 1
    case "--locale":
      let nextIndex = index + 1
      guard nextIndex < arguments.count else {
        throw TranscriptionCliError.invalidArguments("Missing locale after --locale")
      }
      localeIdentifier = arguments[nextIndex]
      index += 2
    case "--input":
      let nextIndex = index + 1
      guard nextIndex < arguments.count else {
        throw TranscriptionCliError.missingInputPath
      }
      inputPath = arguments[nextIndex]
      index += 2
    case "--output":
      let nextIndex = index + 1
      guard nextIndex < arguments.count else {
        throw TranscriptionCliError.invalidArguments("Missing path after --output")
      }
      outputPath = arguments[nextIndex]
      index += 2
    default:
      throw TranscriptionCliError.invalidArguments("Unknown argument: \(argument)")
    }
  }

  if isCheck {
    return .check(localeIdentifier: localeIdentifier, outputPath: outputPath)
  }

  guard let inputPath else {
    throw TranscriptionCliError.missingInputPath
  }

  return .transcribe(
    inputPath: inputPath,
    localeIdentifier: localeIdentifier,
    outputPath: outputPath
  )
}

extension CliCommand {
  var outputPath: String? {
    switch self {
    case let .check(_, outputPath):
      return outputPath
    case let .transcribe(_, _, outputPath):
      return outputPath
    }
  }
}

func resolveAuthorizationStatus() throws -> SFSpeechRecognizerAuthorizationStatus {
  let status = SFSpeechRecognizer.authorizationStatus()
  if status != .notDetermined {
    return status
  }

  let semaphore = DispatchSemaphore(value: 0)
  var resolvedStatus = SFSpeechRecognizerAuthorizationStatus.notDetermined

  SFSpeechRecognizer.requestAuthorization { authorizationStatus in
    resolvedStatus = authorizationStatus
    semaphore.signal()
  }

  let waitResult = semaphore.wait(timeout: .now() + 15)
  if waitResult == .timedOut {
    throw TranscriptionCliError.timeout
  }

  return resolvedStatus
}

func ensureAuthorized() throws {
  let status = try resolveAuthorizationStatus()
  switch status {
  case .authorized:
    return
  case .denied:
    throw TranscriptionCliError.authorizationDenied("denied")
  case .restricted:
    throw TranscriptionCliError.authorizationDenied("restricted")
  case .notDetermined:
    throw TranscriptionCliError.authorizationDenied("not determined")
  @unknown default:
    throw TranscriptionCliError.authorizationDenied("unknown")
  }
}

func buildRecognizer(localeIdentifier: String?) throws -> SFSpeechRecognizer {
  let recognizer: SFSpeechRecognizer?

  if let localeIdentifier {
    recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier))
  } else {
    recognizer = SFSpeechRecognizer()
  }

  guard let recognizer else {
    throw TranscriptionCliError.unsupportedLocale(localeIdentifier ?? Locale.current.identifier)
  }

  let resolvedLocale = recognizer.locale.identifier
  guard recognizer.isAvailable else {
    throw TranscriptionCliError.recognizerUnavailable(resolvedLocale)
  }

  return recognizer
}

func transcribeAudioFile(at inputUrl: URL, localeIdentifier: String?) throws -> String {
  try ensureAuthorized()
  let recognizer = try buildRecognizer(localeIdentifier: localeIdentifier)
  let request = SFSpeechURLRecognitionRequest(url: inputUrl)
  request.shouldReportPartialResults = false
  request.requiresOnDeviceRecognition = true

  let semaphore = DispatchSemaphore(value: 0)
  var finalText: String?
  var recognitionError: Error?

  let task = recognizer.recognitionTask(with: request) { result, error in
    if let result, result.isFinal {
      finalText = result.bestTranscription.formattedString
      semaphore.signal()
      return
    }

    if let error {
      recognitionError = error
      semaphore.signal()
    }
  }

  let waitResult = semaphore.wait(timeout: .now() + 120)
  task.cancel()

  if waitResult == .timedOut {
    throw TranscriptionCliError.timeout
  }

  if let recognitionError {
    throw recognitionError
  }

  guard let finalText else {
    throw TranscriptionCliError.noTranscriptionResult
  }

  let trimmedText = finalText.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmedText.isEmpty else {
    throw TranscriptionCliError.emptyTranscription
  }

  return trimmedText
}

var outputPath: String?

do {
  let command = try parseCommand(arguments: Array(CommandLine.arguments.dropFirst()))
  outputPath = command.outputPath

  switch command {
  case let .check(localeIdentifier, resolvedOutputPath):
    try ensureAuthorized()
    let recognizer = try buildRecognizer(localeIdentifier: localeIdentifier)
    try emitJson(
      CheckPayload(status: "ok", locale: recognizer.locale.identifier),
      outputPath: resolvedOutputPath
    )
  case let .transcribe(inputPath, localeIdentifier, resolvedOutputPath):
    let inputUrl = URL(fileURLWithPath: inputPath)
    let text = try transcribeAudioFile(at: inputUrl, localeIdentifier: localeIdentifier)
    try emitJson(TranscriptionPayload(text: text), outputPath: resolvedOutputPath)
  }
} catch {
  emitError(error.localizedDescription, outputPath: outputPath)
  Foundation.exit(1)
}