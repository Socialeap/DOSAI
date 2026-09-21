import Foundation

enum WatchdogOperation: String {
    case inspect = "INSPECT"
    case stopOne = "STOP_ONE"
    case stopAll = "STOP_ALL"
}

enum FixtureCapsuleState: String {
    case registered = "REGISTERED"
    case running = "RUNNING"
    case stopped = "STOPPED"
    case failed = "FAILED"
    case quarantined = "QUARANTINED"

    var isTerminal: Bool {
        switch self {
        case .stopped, .failed, .quarantined:
            return true
        case .registered, .running:
            return false
        }
    }
}

struct FixtureCapsule {
    let capsuleID: String
    let supervisorGeneration: String
    var state: FixtureCapsuleState
}

struct AdmittedWatchdogRequest {
    let requestID: String
    let sequence: UInt64
    let operation: WatchdogOperation
    let supervisorGeneration: String
    let capsuleID: String?
    let reason: String?
    let signature: String
}

enum WatchdogSubmission {
    case queued
    case replayed(String)
    case rejected(String)
}

struct WatchdogCompletion {
    let operation: WatchdogOperation
    let responseID: String
    let disposition: String
    let capsuleIDs: [String]
}

private enum StoredWatchdogRequest {
    case pending(String)
    case completed(String, String)
}

final class InertWatchdogControlCore {
    static let schemaID = "urn:dosai:schema:watchdog-control-request:1"
    static let serviceBootID = "11111111-1111-4111-8111-111111111111"
    static let serviceGeneration = "1"
    static let sessionID = "22222222-2222-4222-8222-222222222222"
    static let supervisorGeneration = "7"

    private let maxInspectPending = 8
    private let maxStopOnePending = 16
    private let maxStopAllPending = 1
    private var inspectQueue: [AdmittedWatchdogRequest] = []
    private var stopOneQueue: [AdmittedWatchdogRequest] = []
    private var stopAllQueue: [AdmittedWatchdogRequest] = []
    private var requests: [String: StoredWatchdogRequest] = [:]
    private var expectedSequence: UInt64 = 1
    private var responseCounter: UInt64 = 1
    private(set) var sessionOpen = true
    private(set) var capsules: [FixtureCapsule]

    init(capsules: [FixtureCapsule] = InertWatchdogControlCore.defaultCapsules()) {
        self.capsules = capsules
    }

    static func defaultCapsules() -> [FixtureCapsule] {
        [
            FixtureCapsule(
                capsuleID: "44444444-4444-4444-8444-444444444441",
                supervisorGeneration: supervisorGeneration,
                state: .running
            ),
            FixtureCapsule(
                capsuleID: "44444444-4444-4444-8444-444444444442",
                supervisorGeneration: supervisorGeneration,
                state: .registered
            ),
            FixtureCapsule(
                capsuleID: "44444444-4444-4444-8444-444444444443",
                supervisorGeneration: supervisorGeneration,
                state: .stopped
            ),
        ]
    }

    func submit(_ payload: [String: Any]) -> WatchdogSubmission {
        guard sessionOpen else {
            return .rejected("DOSAI_WATCHDOG_UNAVAILABLE_0001")
        }

        let request: AdmittedWatchdogRequest
        do {
            request = try admit(payload)
        } catch let error as WatchdogAdmissionError {
            return .rejected(error.code)
        } catch {
            return .rejected("DOSAI_WATCHDOG_SCHEMA_0001")
        }

        if let stored = requests[request.requestID] {
            switch stored {
            case let .pending(signature):
                if signature == request.signature {
                    return .rejected("DOSAI_WATCHDOG_REPLAY_0001")
                }
            case let .completed(signature, responseID):
                if signature == request.signature {
                    return .replayed(responseID)
                }
            }
            disconnect()
            return .rejected("DOSAI_WATCHDOG_REPLAY_0001")
        }

        guard request.sequence == expectedSequence else {
            return .rejected("DOSAI_WATCHDOG_SEQUENCE_0001")
        }
        guard hasCapacity(for: request.operation) else {
            return .rejected("DOSAI_WATCHDOG_QUEUE_0001")
        }

        switch request.operation {
        case .inspect:
            inspectQueue.append(request)
        case .stopOne:
            stopOneQueue.append(request)
        case .stopAll:
            stopAllQueue.append(request)
        }
        requests[request.requestID] = .pending(request.signature)
        expectedSequence += 1
        return .queued
    }

    func disconnect() {
        guard sessionOpen else { return }
        sessionOpen = false
        inspectQueue.removeAll(keepingCapacity: false)
        stopOneQueue.removeAll(keepingCapacity: false)
        stopAllQueue.removeAll(keepingCapacity: false)
        let internalRequest = AdmittedWatchdogRequest(
            requestID: "99999999-9999-4999-8999-999999999999",
            sequence: expectedSequence,
            operation: .stopAll,
            supervisorGeneration: Self.supervisorGeneration,
            capsuleID: nil,
            reason: "COORDINATOR_DISCONNECT",
            signature: "INTERNAL_DISCONNECT_STOP_ALL"
        )
        stopAllQueue.append(internalRequest)
    }

    func drainNext() -> WatchdogCompletion? {
        let request: AdmittedWatchdogRequest
        if !stopAllQueue.isEmpty {
            request = stopAllQueue.removeFirst()
        } else if !stopOneQueue.isEmpty {
            request = stopOneQueue.removeFirst()
        } else if !inspectQueue.isEmpty {
            request = inspectQueue.removeFirst()
        } else {
            return nil
        }

        let responseID = nextResponseID()
        let completion = execute(request, responseID: responseID)
        if requests[request.requestID] != nil {
            requests[request.requestID] = .completed(request.signature, responseID)
        }
        return completion
    }

    func pendingCounts() -> [String: Int] {
        [
            WatchdogOperation.inspect.rawValue: inspectQueue.count,
            WatchdogOperation.stopOne.rawValue: stopOneQueue.count,
            WatchdogOperation.stopAll.rawValue: stopAllQueue.count,
        ]
    }

    private func hasCapacity(for operation: WatchdogOperation) -> Bool {
        switch operation {
        case .inspect:
            return inspectQueue.count < maxInspectPending
        case .stopOne:
            return stopOneQueue.count < maxStopOnePending
        case .stopAll:
            return stopAllQueue.count < maxStopAllPending
        }
    }

    private func execute(
        _ request: AdmittedWatchdogRequest,
        responseID: String
    ) -> WatchdogCompletion {
        switch request.operation {
        case .inspect:
            let ids = capsules
                .filter { $0.supervisorGeneration == request.supervisorGeneration }
                .map(\.capsuleID)
            return WatchdogCompletion(
                operation: .inspect,
                responseID: responseID,
                disposition: "OBSERVED",
                capsuleIDs: ids
            )
        case .stopOne:
            guard let capsuleID = request.capsuleID,
                  let index = capsules.firstIndex(where: {
                      $0.capsuleID == capsuleID
                          && $0.supervisorGeneration == request.supervisorGeneration
                  }) else {
                return WatchdogCompletion(
                    operation: .stopOne,
                    responseID: responseID,
                    disposition: "NOT_FOUND",
                    capsuleIDs: []
                )
            }
            if capsules[index].state == .failed || capsules[index].state == .quarantined {
                return WatchdogCompletion(
                    operation: .stopOne,
                    responseID: responseID,
                    disposition: "QUARANTINED",
                    capsuleIDs: [capsuleID]
                )
            }
            if !capsules[index].state.isTerminal {
                capsules[index].state = .stopped
            }
            return WatchdogCompletion(
                operation: .stopOne,
                responseID: responseID,
                disposition: "STOPPED",
                capsuleIDs: [capsuleID]
            )
        case .stopAll:
            var affected: [String] = []
            var cleanupUncertain = false
            for index in capsules.indices
            where capsules[index].supervisorGeneration == request.supervisorGeneration {
                if capsules[index].state == .failed || capsules[index].state == .quarantined {
                    cleanupUncertain = true
                } else if !capsules[index].state.isTerminal {
                    capsules[index].state = .stopped
                }
                affected.append(capsules[index].capsuleID)
            }
            return WatchdogCompletion(
                operation: .stopAll,
                responseID: responseID,
                disposition: cleanupUncertain ? "QUARANTINED" : "STOPPED",
                capsuleIDs: affected
            )
        }
    }

    private func admit(_ payload: [String: Any]) throws -> AdmittedWatchdogRequest {
        guard payload["schema_version"] is Int,
              payload["schema_version"] as? Int == 1,
              payload["schema_id"] as? String == Self.schemaID,
              let requestID = payload["request_id"] as? String,
              let sessionID = payload["session_id"] as? String,
              let serviceBootID = payload["service_boot_id"] as? String,
              let serviceGeneration = payload["service_generation"] as? String,
              let sequenceText = payload["sequence"] as? String,
              let operationText = payload["operation"] as? String,
              let supervisorGeneration = payload["supervisor_generation"] as? String,
              let authorization = payload["authorization"] as? String,
              authorization == "NO_EFFECT_TEST_ONLY",
              validUUIDv4(requestID),
              validUUIDv4(sessionID),
              validUUIDv4(serviceBootID),
              canonicalPositiveDecimal(serviceGeneration) != nil,
              let sequence = canonicalPositiveDecimal(sequenceText),
              canonicalPositiveDecimal(supervisorGeneration) != nil,
              let operation = WatchdogOperation(rawValue: operationText)
        else {
            throw WatchdogAdmissionError("DOSAI_WATCHDOG_SCHEMA_0001")
        }

        guard sessionID == Self.sessionID,
              serviceBootID == Self.serviceBootID,
              serviceGeneration == Self.serviceGeneration,
              supervisorGeneration == Self.supervisorGeneration
        else {
            throw WatchdogAdmissionError("DOSAI_WATCHDOG_IDENTITY_0001")
        }

        let baseKeys: Set<String> = [
            "schema_id", "schema_version", "request_id", "session_id",
            "service_boot_id", "service_generation", "sequence", "operation",
            "supervisor_generation", "authorization",
        ]
        var expectedKeys = baseKeys
        var capsuleID: String?
        var reason: String?

        switch operation {
        case .inspect:
            break
        case .stopOne:
            expectedKeys.formUnion(["capsule_id", "reason"])
            guard let value = payload["capsule_id"] as? String,
                  validUUIDv4(value),
                  let reasonValue = payload["reason"] as? String,
                  ["OWNER_REQUEST", "WATCHDOG_TIMEOUT", "EMERGENCY_STOP"].contains(reasonValue)
            else {
                throw WatchdogAdmissionError("DOSAI_WATCHDOG_SCHEMA_0001")
            }
            capsuleID = value
            reason = reasonValue
        case .stopAll:
            expectedKeys.insert("reason")
            guard let reasonValue = payload["reason"] as? String,
                  ["OWNER_REQUEST", "COORDINATOR_DISCONNECT", "EMERGENCY_STOP"].contains(reasonValue)
            else {
                throw WatchdogAdmissionError("DOSAI_WATCHDOG_SCHEMA_0001")
            }
            reason = reasonValue
        }

        guard Set(payload.keys) == expectedKeys else {
            throw WatchdogAdmissionError("DOSAI_WATCHDOG_SCHEMA_0001")
        }

        let signatureParts = [
            requestID,
            sessionID,
            serviceBootID,
            serviceGeneration,
            sequenceText,
            operation.rawValue,
            supervisorGeneration,
            capsuleID ?? "",
            reason ?? "",
            authorization,
        ]
        let signature = signatureParts.map { "\($0.utf8.count):\($0)" }.joined(separator: "|")
        return AdmittedWatchdogRequest(
            requestID: requestID,
            sequence: sequence,
            operation: operation,
            supervisorGeneration: supervisorGeneration,
            capsuleID: capsuleID,
            reason: reason,
            signature: signature
        )
    }

    private func nextResponseID() -> String {
        defer { responseCounter += 1 }
        return String(format: "aaaaaaaa-aaaa-4aaa-8aaa-%012llx", responseCounter)
    }
}

struct WatchdogAdmissionError: Error {
    let code: String

    init(_ code: String) {
        self.code = code
    }
}

private func validUUIDv4(_ value: String) -> Bool {
    guard value.count == 36,
          value == value.lowercased(),
          UUID(uuidString: value) != nil
    else { return false }
    let characters = Array(value)
    return characters[8] == "-"
        && characters[13] == "-"
        && characters[14] == "4"
        && characters[18] == "-"
        && ["8", "9", "a", "b"].contains(characters[19])
        && characters[23] == "-"
}

private func canonicalPositiveDecimal(_ value: String) -> UInt64? {
    guard !value.isEmpty,
          value.allSatisfy({ $0.isASCII && $0.isNumber }),
          value.first != "0",
          value.count <= 32,
          let parsed = UInt64(value),
          parsed > 0,
          String(parsed) == value
    else { return nil }
    return parsed
}

func watchdogFixtureRequest(
    requestID: String,
    sequence: UInt64,
    operation: WatchdogOperation,
    capsuleID: String? = nil,
    reason: String? = nil,
    extra: [String: Any] = [:]
) -> [String: Any] {
    var payload: [String: Any] = [
        "schema_id": InertWatchdogControlCore.schemaID,
        "schema_version": 1,
        "request_id": requestID,
        "session_id": InertWatchdogControlCore.sessionID,
        "service_boot_id": InertWatchdogControlCore.serviceBootID,
        "service_generation": InertWatchdogControlCore.serviceGeneration,
        "sequence": String(sequence),
        "operation": operation.rawValue,
        "supervisor_generation": InertWatchdogControlCore.supervisorGeneration,
        "authorization": "NO_EFFECT_TEST_ONLY",
    ]
    if let capsuleID { payload["capsule_id"] = capsuleID }
    if let reason { payload["reason"] = reason }
    for (key, value) in extra { payload[key] = value }
    return payload
}
