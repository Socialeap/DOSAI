import CryptoKit
import Darwin
import Foundation
import LocalAuthentication
import Security

private let authorizationPhrase = "DOSAI_OWNER_AUTHORIZED_LOCAL_SECURE_ENCLAVE_PROOF_V1"
private let cleanupCommand = "cleanup-test-key"
private let helperSchema = "DOSAI_SECURE_ENCLAVE_PROOF_HELPER_V1"
private let lifecycleCommand = "exercise-test-lifecycle"
private let proofTagPrefix = "com.socialeap.dosai.audit.secure-enclave.proof.v1."

private struct HelperFailure: Error {
  let code: String
  let exitCode: Int32
}

private func fail(_ code: String, exitCode: Int32 = 70) throws -> Never {
  throw HelperFailure(code: code, exitCode: exitCode)
}

private func discard(_ error: inout Unmanaged<CFError>?) {
  if let retained = error {
    _ = retained.takeRetainedValue()
    error = nil
  }
}

private func digestHex(_ data: Data) -> String {
  SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private func canonicalRunID(_ value: String) throws -> String {
  guard let parsed = UUID(uuidString: value) else {
    try fail("DOSAI_SECURE_ENCLAVE_PROTOCOL_0002", exitCode: 64)
  }
  let canonical = parsed.uuidString.lowercased()
  guard value == canonical else {
    try fail("DOSAI_SECURE_ENCLAVE_PROTOCOL_0002", exitCode: 64)
  }
  return canonical
}

private func testKeyQuery(tag: Data, returnReference: Bool) -> [String: Any] {
  let context = LAContext()
  context.interactionNotAllowed = true
  return [
    kSecClass as String: kSecClassKey,
    kSecAttrApplicationTag as String: tag,
    kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
    kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
    kSecMatchLimit as String: kSecMatchLimitOne,
    kSecReturnRef as String: returnReference,
    kSecUseAuthenticationContext as String: context,
  ]
}

private func testKeyExists(tag: Data) throws -> Bool {
  var result: CFTypeRef?
  let status = SecItemCopyMatching(
    testKeyQuery(tag: tag, returnReference: true) as CFDictionary,
    &result
  )
  switch status {
  case errSecSuccess:
    return true
  case errSecItemNotFound:
    return false
  default:
    try fail("DOSAI_SECURE_ENCLAVE_KEYCHAIN_0001")
  }
}

private func deleteTestKey(tag: Data) throws {
  var query = testKeyQuery(tag: tag, returnReference: false)
  query.removeValue(forKey: kSecMatchLimit as String)
  query.removeValue(forKey: kSecReturnRef as String)
  let status = SecItemDelete(query as CFDictionary)
  guard status == errSecSuccess || status == errSecItemNotFound else {
    try fail("DOSAI_SECURE_ENCLAVE_CLEANUP_0001")
  }
}

private func createTestKey(tag: Data) throws -> SecKey {
  var accessError: Unmanaged<CFError>?
  guard let access = SecAccessControlCreateWithFlags(
    nil,
    kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    [.privateKeyUsage],
    &accessError
  ) else {
    discard(&accessError)
    try fail("DOSAI_SECURE_ENCLAVE_ACCESS_CONTROL_0001")
  }
  discard(&accessError)

  let parameters: [String: Any] = [
    kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
    kSecAttrKeySizeInBits as String: 256,
    kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
    kSecPrivateKeyAttrs as String: [
      kSecAttrAccessControl as String: access,
      kSecAttrApplicationTag as String: tag,
      kSecAttrIsPermanent as String: true,
    ],
  ]

  var createError: Unmanaged<CFError>?
  guard let key = SecKeyCreateRandomKey(parameters as CFDictionary, &createError) else {
    discard(&createError)
    try fail("DOSAI_SECURE_ENCLAVE_KEY_CREATE_0001")
  }
  discard(&createError)
  return key
}

private func subjectPublicKeyInfo(_ x963: Data) throws -> Data {
  guard x963.count == 65, x963.first == 0x04 else {
    try fail("DOSAI_SECURE_ENCLAVE_PUBLIC_KEY_0001")
  }
  let p256SPKIPrefix: [UInt8] = [
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01,
    0x07, 0x03, 0x42, 0x00,
  ]
  return Data(p256SPKIPrefix) + x963
}

private func inspectAndExercise(privateKey: SecKey, runID: String) throws -> [String: Any] {
  guard
    let attributes = SecKeyCopyAttributes(privateKey) as? [String: Any],
    attributes[kSecAttrTokenID as String] as? String == kSecAttrTokenIDSecureEnclave as String,
    (attributes[kSecAttrKeySizeInBits as String] as? NSNumber)?.intValue == 256,
    (attributes[kSecAttrCanSign as String] as? NSNumber)?.boolValue == true
  else {
    try fail("DOSAI_SECURE_ENCLAVE_ATTRIBUTES_0001")
  }

  var privateExportError: Unmanaged<CFError>?
  let privateExport = SecKeyCopyExternalRepresentation(privateKey, &privateExportError)
  discard(&privateExportError)
  guard privateExport == nil else {
    try fail("DOSAI_SECURE_ENCLAVE_EXPORT_0001")
  }

  guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
    try fail("DOSAI_SECURE_ENCLAVE_PUBLIC_KEY_0001")
  }
  var publicExportError: Unmanaged<CFError>?
  guard let publicBytes = SecKeyCopyExternalRepresentation(publicKey, &publicExportError) as Data? else {
    discard(&publicExportError)
    try fail("DOSAI_SECURE_ENCLAVE_PUBLIC_KEY_0001")
  }
  discard(&publicExportError)
  let spki = try subjectPublicKeyInfo(publicBytes)

  let challenge = Data("DOSAI-SECURE-ENCLAVE-LIFECYCLE-PROOF-V1\n\(runID)\n".utf8)
  let algorithm = SecKeyAlgorithm.ecdsaSignatureMessageX962SHA256
  guard
    SecKeyIsAlgorithmSupported(privateKey, .sign, algorithm),
    SecKeyIsAlgorithmSupported(publicKey, .verify, algorithm)
  else {
    try fail("DOSAI_SECURE_ENCLAVE_ALGORITHM_0001")
  }

  var signatureError: Unmanaged<CFError>?
  guard let signature = SecKeyCreateSignature(
    privateKey,
    algorithm,
    challenge as CFData,
    &signatureError
  ) as Data? else {
    discard(&signatureError)
    try fail("DOSAI_SECURE_ENCLAVE_SIGNATURE_0001")
  }
  discard(&signatureError)

  var verificationError: Unmanaged<CFError>?
  let verified = SecKeyVerifySignature(
    publicKey,
    algorithm,
    challenge as CFData,
    signature as CFData,
    &verificationError
  )
  discard(&verificationError)
  guard verified else {
    try fail("DOSAI_SECURE_ENCLAVE_SIGNATURE_0001")
  }

  return [
    "algorithm": "ECDSA_P256_SHA256",
    "challenge_sha256": digestHex(challenge),
    "key_id_sha256": digestHex(spki),
    "private_key_export": "UNAVAILABLE",
    "public_key_spki_der_base64": spki.base64EncodedString(),
    "remote_attestation": "UNAVAILABLE",
    "signature_verified": true,
    "token": "SECURE_ENCLAVE",
  ]
}

private func exerciseTestLifecycle(runID: String) throws -> [String: Any] {
  let tag = Data((proofTagPrefix + runID).utf8)
  guard try !testKeyExists(tag: tag) else {
    try fail("DOSAI_SECURE_ENCLAVE_PREEXISTING_KEY_0001")
  }

  let privateKey = try createTestKey(tag: tag)
  var proof: [String: Any]?
  var operationFailure: HelperFailure?
  do {
    guard try testKeyExists(tag: tag) else {
      try fail("DOSAI_SECURE_ENCLAVE_PERSISTENCE_0001")
    }
    proof = try inspectAndExercise(privateKey: privateKey, runID: runID)
  } catch let failure as HelperFailure {
    operationFailure = failure
  } catch {
    operationFailure = HelperFailure(code: "DOSAI_SECURE_ENCLAVE_INTERNAL_0001", exitCode: 70)
  }

  try deleteTestKey(tag: tag)
  guard try !testKeyExists(tag: tag) else {
    try fail("DOSAI_SECURE_ENCLAVE_CLEANUP_0001")
  }
  if let failure = operationFailure {
    throw failure
  }
  guard var completedProof = proof else {
    try fail("DOSAI_SECURE_ENCLAVE_INTERNAL_0001")
  }
  completedProof["cleanup_confirmed"] = true
  completedProof["mutation_performed"] = true
  completedProof["run_id"] = runID
  return completedProof
}

private func cleanupTestKey(runID: String) throws -> [String: Any] {
  let tag = Data((proofTagPrefix + runID).utf8)
  let found = try testKeyExists(tag: tag)
  try deleteTestKey(tag: tag)
  guard try !testKeyExists(tag: tag) else {
    try fail("DOSAI_SECURE_ENCLAVE_CLEANUP_0001")
  }
  return [
    "cleanup_confirmed": true,
    "mutation_performed": found,
    "preexisting_test_key_found": found,
    "run_id": runID,
  ]
}

private func authorizedRunID(_ arguments: [String]) throws -> String {
  guard arguments.count == 3 else {
    try fail("DOSAI_SECURE_ENCLAVE_PROTOCOL_0001", exitCode: 64)
  }
  guard arguments[2] == authorizationPhrase else {
    try fail("DOSAI_SECURE_ENCLAVE_AUTHORIZATION_0001", exitCode: 77)
  }
  return try canonicalRunID(arguments[1])
}

private func describe() -> [String: Any] {
  [
    "helper_id": "com.socialeap.dosai.secure-enclave-proof",
    "key_scope": "UNIQUE_TRANSIENT_TEST_TAG_ONLY",
    "minimum_macos_version": "15.0",
    "mutation_performed": false,
    "network_authority": false,
    "operations": ["describe", lifecycleCommand, cleanupCommand],
    "production_checkpoint_signing": false,
    "protocol_version": 1,
    "remote_attestation": "UNAVAILABLE",
    "stdin_consumed": false,
  ]
}

private func dispatch(_ arguments: [String]) throws -> [String: Any] {
  guard let command = arguments.first else {
    try fail("DOSAI_SECURE_ENCLAVE_PROTOCOL_0001", exitCode: 64)
  }
  switch command {
  case "describe":
    guard arguments.count == 1 else {
      try fail("DOSAI_SECURE_ENCLAVE_PROTOCOL_0001", exitCode: 64)
    }
    return describe()
  case lifecycleCommand:
    return try exerciseTestLifecycle(runID: authorizedRunID(arguments))
  case cleanupCommand:
    return try cleanupTestKey(runID: authorizedRunID(arguments))
  default:
    try fail("DOSAI_SECURE_ENCLAVE_PROTOCOL_0001", exitCode: 64)
  }
}

private func emit(_ object: [String: Any]) {
  guard
    JSONSerialization.isValidJSONObject(object),
    let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  else {
    Darwin.exit(70)
  }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0a]))
}

@main
private struct DOSAISecureEnclaveProofHelper {
  static func main() {
    do {
      let result = try dispatch(Array(CommandLine.arguments.dropFirst()))
      emit(["ok": true, "result": result, "schema": helperSchema])
    } catch let failure as HelperFailure {
      emit(["error": ["code": failure.code], "ok": false, "schema": helperSchema])
      Darwin.exit(failure.exitCode)
    } catch {
      emit([
        "error": ["code": "DOSAI_SECURE_ENCLAVE_INTERNAL_0001"],
        "ok": false,
        "schema": helperSchema,
      ])
      Darwin.exit(70)
    }
  }
}
