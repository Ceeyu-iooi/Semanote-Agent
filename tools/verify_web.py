"""Exercise the real HTTP/JDBC/JavaScript chain in a newly created disposable database."""

import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from local_web import projectRoot, runtimeRoot, toolRoot, creationFlags, mysql, backendEnvironment, startDatabase

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
receiptRoot = projectRoot / "profile/verification/web"
receiptRoot.mkdir(parents=True, exist_ok=True)
databaseName = "semanote_verify_" + uuid.uuid4().hex[:12]
restoreName = databaseName + "_restore"
process = None
checks = []


def check(name, condition):
    if not condition: raise AssertionError(name)
    checks.append(name)
    print("PASS " + name, flush=True)


def call(path, body=None, method=None, headers=None, raw=None):
    data = raw if raw is not None else None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request("http://127.0.0.1:8081/api/v1" + path, data=data, headers=headers or {"Content-Type": "application/json"}, method=method)
    try:
        with opener.open(request, timeout=30) as response: return response.status, json.load(response)
    except urllib.error.HTTPError as error: return error.code, json.load(error)


def start():
    global process
    environment = backendEnvironment()
    environment.update({"SEMANOTE_SEED_CORPUS":"false", "SEMANOTE_PORT": "8081", "SEMANOTE_BIND_ADDRESS": "127.0.0.1", "SEMANOTE_LAN_HOSTS": "", "SEMANOTE_DB_URL": "jdbc:mysql://127.0.0.1:3307/" + databaseName + "?characterEncoding=UTF-8&serverTimezone=UTC"})
    with (receiptRoot / "isolated-backend.log").open("ab") as log:
        process = subprocess.Popen(["java", "-jar", "backend/target/semanote-web-0.1.1-SNAPSHOT.jar"], cwd=projectRoot, env=environment, stdout=log, stderr=log, creationflags=creationFlags)
    for _ in range(100):
        try:
            if call("/health")[0] == 200: return
        except OSError:
            pass
        if process.poll() is not None: raise RuntimeError("Isolated backend failed; see local log")
        time.sleep(.2)
    raise RuntimeError("Isolated backend readiness timeout")


def stop():
    global process
    if process is not None:
        process.terminate()
        process.wait(timeout=20)
        process = None


def upload(name, data):
    boundary = "semanote" + uuid.uuid4().hex
    raw = ("--" + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + name + '"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + data + ("\r\n--" + boundary + "--\r\n").encode()
    return call("/imports", raw=raw, headers={"Content-Type": "multipart/form-data; boundary=" + boundary})


try:
    startDatabase()
    createSql = f"CREATE DATABASE {databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,REFERENCES,INDEX,ALTER ON {databaseName}.* TO 'semanote'@'localhost';"
    check("create isolated database", mysql(["--execute=" + createSql]).returncode == 0)
    start()
    text = "小林😀在杭州。小林😀在杭州。"
    code, document = call("/documents", {"title": "HTTP 合成验证", "text": text})
    check("create and reload exact Unicode text", code == 201 and call("/documents/" + document["id"])[1]["revision"]["textBody"] == text)
    path = "/documents/" + document["id"]
    tokens = ["小林", "😀", "在", "杭州", "。"] * 2
    layers = {"segmentation": [{"itemText": token} for token in tokens],
              "pos": [{"tokenIndex": index, "label": ["PROPN", "SYM", "ADP", "PROPN", "PUNCT"][index % 5]} for index in range(10)],
              "keywords": [{"itemText": "小林"}, {"itemText": "杭州"}],
              "ner": [{"itemText": word, "label": label, "occurrence": occurrence} for word, label in [("小林", "PERSON"), ("杭州", "LOCATION")] for occurrence in [0, 1]]}
    sentence="小林😀在杭州。"
    layers.update({"paragraphs":[{"itemText":text}],
                   "relations":[{"itemText":sentence,"label":"位于","subject":"小林","object":"杭州","occurrence":i} for i in [0,1]],
                   "events":[{"itemText":sentence,"label":"到访","roles":{"subject":["小林"],"location":["杭州"]},"occurrence":i} for i in [0,1]],
                   "sentiment":[{"itemText":sentence,"label":"NEUTRAL","occurrence":i} for i in [0,1]],
                   "intent":[{"itemText":sentence,"label":"INFORM","occurrence":i} for i in [0,1]],
                   "semantic":[{"itemText":sentence,"label":"EXPLANATION","occurrence":i} for i in [0,1]],"errors":[]})
    code, document = call(path + "/snapshots", {"rowVersion": document["rowVersion"], "revisionId": document["currentRevisionId"], "layers": layers, "allowPartial": True})
    check("save eleven manual layers through JavaScript validator", code == 200)
    snapshotId = document["currentSnapshotId"]
    code, exported = call(path + "/exports/" + snapshotId)
    check("snapshot statistics/export Unicode and occurrences", code == 200 and exported["snapshot"]["statistics"]["ner"]["itemCount"] == 4 and exported["snapshot"]["statistics"]["keywords"]["occurrenceCount"] == 4 and next(item for item in exported["snapshot"]["layers"]["ner"]["result"]["items"] if item["itemText"] == "杭州")["spans"][0]["start"] == 4)
    originalRevision = document["currentRevisionId"]
    code, invalid = call(path + "/snapshots", {"rowVersion": document["rowVersion"], "revisionId": originalRevision, "layers": {"segmentation": [{"itemText": "缺失"}]}, "allowPartial": True})
    check("invalid annotation rejected without changing saved snapshot", code == 400 and call(path)[1]["currentSnapshotId"] == snapshotId)
    code, document = call(path, {"rowVersion": document["rowVersion"], "title": document["title"], "text": text + "结束。"}, "PUT")
    check("text revision invalidates only current annotations", code == 200 and document["currentSnapshotId"] is None and call(path + "/exports/" + snapshotId)[1]["snapshot"]["revision"]["textBody"] == text)
    check("stale write returns 409", call(path, {"rowVersion": 1, "title": "旧页面", "text": "新文本"}, "PUT")[0] == 409)
    check("stale annotation revision returns 409", call(path + "/snapshots", {"rowVersion": document["rowVersion"], "revisionId": originalRevision, "layers": layers, "allowPartial": True})[0] == 409)
    code, imported = upload("source.csv", '\ufeffA,B,C\r\n" 合成\r\n文本 ",重复,重复\r\n,,独立\r\n'.encode("utf-8"))
    check("CSV duplicates blank count and source row/column preserved", code == 200 and imported["importedCount"] == 4 and imported["skippedCount"] == 2 and call("/documents/" + imported["documentIds"][0])[1]["source"]["rowNumber"] == 2)
    countBefore = len(call("/documents")[1])
    check("malformed CSV and UTF8 imports are atomic", upload("bad.csv", b"A,B,C\na,b,c\nbroken,row\n")[0] == 400 and upload("bad.txt", b"\xff")[0] == 400 and len(call("/documents")[1]) == countBefore)
    check("batch/text/file limits reject without truncation", upload("many.csv", ("A,B,C\n" + "a,b,c\n" * 167).encode())[0] == 413 and call("/documents", {"title": "超限", "text": "😀" * 10001})[0] == 413 and upload("large.txt", b"a" * (5 * 1024 * 1024 + 1))[0] == 413)
    check("full text search payload includes content after preview", call("/documents", {"title": "搜索", "text": "字" * 100 + "末尾词"})[1]["revision"]["textBody"].endswith("末尾词") and any("末尾词" in item.get("searchText", "") for item in call("/documents")[1]))
    check("cross-site multipart write rejected", call("/documents", {"title": "跨站", "text": "测试"}, headers={"Content-Type": "application/json", "Origin": "https://example.com"})[0] == 403)
    check("nonlocal Host cannot read the workspace", call("/documents", headers={"Host": "example.com:8081"})[0] == 403)
    jobBody = {"requestId": str(uuid.uuid4()), "documentId": document["id"], "revisionId": document["currentRevisionId"], "tasks": ["ner"], "provider": "missing_" + uuid.uuid4().hex[:20], "remoteConsent": True}
    check("unconfigured provider rejected before enqueue without remote call", call("/jobs", jobBody)[0] == 400)
    check("remote consent required before enqueue", call("/jobs", {**jobBody, "requestId": str(uuid.uuid4()), "remoteConsent": False})[0] == 400)
    # Insert a synthetic interrupted record directly in this disposable database to test recovery.
    fixtureId=str(uuid.uuid4())
    sql="INSERT INTO annotationJob(id,documentId,revisionId,provider,state,requestJson,createdAt,updatedAt) VALUES ('"+fixtureId+"','"+document["id"]+"','"+document["currentRevisionId"]+"','fixture','running','{}','2026-10-28T00:00:00Z','2026-10-28T00:00:00Z')"
    check("synthetic interrupted fixture stored", mysql([databaseName,"--execute="+sql]).returncode == 0)
    time.sleep(.3)
    stop()
    mysql([databaseName, "--execute=UPDATE annotationJob SET state='running' LIMIT 1"])
    start()
    check("restart recovers interrupted state without implicit inference", any(item["state"] == "interrupted" for item in call("/jobs")[1]))
    stop()
    dump = subprocess.run(["profile/tools/mysql/bin/mysqldump.exe", "--defaults-file=profile/runtime/mysql-client.cnf", "--single-transaction", "--no-tablespaces", "--set-gtid-purged=OFF", databaseName], cwd=projectRoot, capture_output=True, creationflags=creationFlags)
    check("SQL structure/data backup", dump.returncode == 0 and b"CREATE TABLE" in dump.stdout and b"INSERT INTO" in dump.stdout)
    mysql(["--execute=CREATE DATABASE " + restoreName + " CHARACTER SET utf8mb4"])
    restored = mysql([restoreName], dump.stdout)
    original = mysql([databaseName, "--batch", "--skip-column-names", "--execute=SELECT COUNT(*) FROM textDocument; SELECT COUNT(*) FROM annotationSnapshot;"])
    restoredCounts = mysql([restoreName, "--batch", "--skip-column-names", "--execute=SELECT COUNT(*) FROM textDocument; SELECT COUNT(*) FROM annotationSnapshot;"])
    check("SQL restore into a new empty database", restored.returncode == 0 and original.stdout == restoredCounts.stdout)
    (receiptRoot / "regression.json").write_text(json.dumps({"status": "passed", "checks": checks, "remoteCalls": 0, "scope": "isolated MySQL HTTP/JavaScript integration; synthetic data only"}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
finally:
    stop()
    for name in (restoreName, databaseName):
        if name.startswith("semanote_verify_") and name.replace("_", "").isalnum():
            mysql(["--execute=DROP DATABASE IF EXISTS " + name])
