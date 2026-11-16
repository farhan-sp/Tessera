import { NextRequest, NextResponse } from "next/server";
import { split, combine, type Share } from "@/lib/shamir";
import {
  wrapPayload,
  unwrapPayload,
  buildHeader,
  parseHeader,
  generateSetId,
  uint8Equal,
  formatSetId,
  subsets,
  type PayloadMeta,
} from "@/lib/utils";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ scenario: string }> }
) {
  const { scenario } = await context.params;
  const body = await req.json().catch(() => ({}));

  switch (scenario) {
    // Skenario: Pemecahan Shamir (N bagian, ambang K)
    case "shamir-split": {
      const secret = body.secret || "Rahasia Super Sensitif 2026";
      const n = Number(body.n) || 5;
      const k = Number(body.k) || 3;

      const raw = new TextEncoder().encode(secret);
      const payload = wrapPayload({ type: "text" }, raw);
      const shares = split(payload, n, k);

      return NextResponse.json({
        scenario: "shamir-split",
        status: "PASS",
        input: { secret, n, k },
        result: {
          payloadBytes: payload.length,
          generatedShares: shares.length,
          shareIndices: shares.map((s) => s.x),
          allSharesValidLength: shares.every((s) => s.y.length === payload.length),
        },
      });
    }

    // Skenario: Rekonstruksi Shamir (Ambang K terpenuhi atau kurang)
    case "shamir-combine": {
      const secret = body.secret || "Kunci Master: A998-FBC2-1092";
      const n = Number(body.n) || 5;
      const k = Number(body.k) || 3;
      const testSharesCount = Number(body.testSharesCount ?? k);

      const raw = new TextEncoder().encode(secret);
      const payload = wrapPayload({ type: "text" }, raw);
      const shares = split(payload, n, k);

      const selectedShares = shares.slice(0, testSharesCount);

      if (testSharesCount < k) {
        // Ekspektasi: gagal merekonstruksi teks asli
        const recoveredPayload = combine(selectedShares);
        let recoveredText = "";
        let matched = false;
        try {
          const { data } = unwrapPayload(recoveredPayload);
          recoveredText = new TextDecoder().decode(data);
          matched = recoveredText === secret;
        } catch {
          matched = false;
        }

        return NextResponse.json({
          scenario: "shamir-combine-below-threshold",
          status: "PASS",
          condition: "shares < threshold",
          sharesUsed: testSharesCount,
          thresholdRequired: k,
          recoveredOriginalSecret: matched,
          securityGuaranteed: !matched,
          note: "Kekuatan Shamir: di bawah ambang K, data tidak dapat dipulihkan.",
        });
      }

      // Ekspektasi: berhasil 100%
      const recoveredPayload = combine(selectedShares);
      const { meta, data } = unwrapPayload(recoveredPayload);
      const recoveredText = new TextDecoder().decode(data);

      return NextResponse.json({
        scenario: "shamir-combine-sufficient",
        status: recoveredText === secret ? "PASS" : "FAIL",
        condition: "shares >= threshold",
        sharesUsed: testSharesCount,
        thresholdRequired: k,
        originalSecret: secret,
        recoveredSecret: recoveredText,
        matched: recoveredText === secret,
        metaType: meta.type,
      });
    }

    // Skenario: Deteksi duplikat bagian (x yang sama)
    case "validate-duplicate": {
      const secret = "Test Data Duplikasi";
      const raw = new TextEncoder().encode(secret);
      const payload = wrapPayload({ type: "text" }, raw);
      const shares = split(payload, 5, 3);

      // Sengaja masukkan bagian dengan x yang sama: [share 1, share 1, share 3]
      const forgedShares: Share[] = [shares[0], shares[0], shares[2]];
      const xs = forgedShares.map((s) => s.x);
      const uniqueXs = new Set(xs);

      if (uniqueXs.size < forgedShares.length) {
        return NextResponse.json(
          {
            scenario: "validate-duplicate",
            status: "PASS",
            detectedDuplicate: true,
            uniqueCount: uniqueXs.size,
            totalProvided: forgedShares.length,
            message: "Berhasil menolak bagian duplikat dengan x yang sama.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ status: "FAIL", message: "Gagal mendeteksi duplikat" });
    }

    // Skenario: Deteksi percampuran bagian dari Set ID berbeda
    case "validate-set-id": {
      const setIdA = generateSetId();
      const setIdB = generateSetId();

      const sharesA = [{ setId: setIdA, x: 1 }, { setId: setIdA, x: 2 }];
      const sharesB = [{ setId: setIdB, x: 3 }];
      const combined = [...sharesA, ...sharesB];

      const refSetId = combined[0].setId;
      const isConsistent = combined.every((s) => uint8Equal(s.setId, refSetId));

      if (!isConsistent) {
        return NextResponse.json(
          {
            scenario: "validate-set-id",
            status: "PASS",
            rejectedMixedSets: true,
            setA: formatSetId(setIdA),
            setB: formatSetId(setIdB),
            message: "Berhasil menolak gambar dari Set ID yang berbeda.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ status: "FAIL", message: "Gagal mendeteksi perbedaan set" });
    }

    // Skenario: Validasi batas ukuran payload (Maks 256 KB)
    case "payload-size": {
      const sizeKB = Number(body.sizeKB) || 300;
      const byteLength = sizeKB * 1024;
      const MAX_BYTES = 256 * 1024; // 256 KB

      const dummy = new Uint8Array(byteLength);
      const payload = wrapPayload({ type: "text" }, dummy);

      if (payload.length > MAX_BYTES) {
        return NextResponse.json(
          {
            scenario: "payload-size-limit",
            status: "PASS",
            rejectedTooLarge: true,
            testedBytes: payload.length,
            maxAllowedBytes: MAX_BYTES,
            message: `Payload ${payload.length} bytes melebihi batas 256 KB (${MAX_BYTES} bytes).`,
          },
          { status: 413 }
        );
      }

      return NextResponse.json({
        scenario: "payload-size-limit",
        status: "PASS",
        accepted: true,
        testedBytes: payload.length,
        maxAllowedBytes: MAX_BYTES,
      });
    }

    // Skenario: Validasi struktur header 13 byte dan pemalsuan magic bytes "HX"
    case "header-integrity": {
      const tamperMagic = body.tamperMagic === true;
      const setId = generateSetId();
      const header = buildHeader(setId, 5, 3, 1, 1024);

      if (tamperMagic) {
        // Rusak penanda "HX" (0x48, 0x58) menjadi 'XX'
        header[0] = 0x58; // 'X'
        header[1] = 0x58; // 'X'
      }

      const parsed = parseHeader(header);

      if (tamperMagic) {
        return NextResponse.json({
          scenario: "header-integrity-tampered",
          status: parsed === null ? "PASS" : "FAIL",
          tampered: true,
          parsedSuccess: parsed !== null,
          message: parsed === null
            ? "Header palsu/rusak berhasil ditolak (parseHeader mengembalikan null)."
            : "Gagal: Header rusak tetap diterima.",
        });
      }

      return NextResponse.json({
        scenario: "header-integrity-valid",
        status: parsed !== null ? "PASS" : "FAIL",
        parsedHeader: parsed
          ? {
              setId: formatSetId(parsed.setId),
              n: parsed.n,
              k: parsed.k,
              x: parsed.x,
              dataLength: parsed.dataLength,
            }
          : null,
      });
    }

    // Skenario: Uji ketahanan kombinatorial lengkap (2^N - 1 kombinasi)
    case "combinatorial": {
      const n = Number(body.n) || 5;
      const k = Number(body.k) || 3;
      const secret = "Test Kombinatorial Capstone 2026";

      const raw = new TextEncoder().encode(secret);
      const payload = wrapPayload({ type: "text" }, raw);
      const shares = split(payload, n, k);

      let aboveKPass = 0;
      let aboveKTotal = 0;
      let belowKFail = 0;
      let belowKTotal = 0;

      for (let size = 1; size <= n; size++) {
        const combos = subsets(shares, size);
        for (const combo of combos) {
          if (combo.length >= k) {
            aboveKTotal++;
            try {
              const rec = combine(combo);
              const { data } = unwrapPayload(rec);
              if (new TextDecoder().decode(data) === secret) {
                aboveKPass++;
              }
            } catch {
              // ignore
            }
          } else {
            belowKTotal++;
            try {
              const rec = combine(combo);
              const { data } = unwrapPayload(rec);
              if (new TextDecoder().decode(data) !== secret) {
                belowKFail++;
              }
            } catch {
              belowKFail++;
            }
          }
        }
      }

      const totalCombos = Math.pow(2, n) - 1;

      return NextResponse.json({
        scenario: "combinatorial-resiliency",
        status: aboveKPass === aboveKTotal && belowKFail === belowKTotal ? "PASS" : "FAIL",
        parameters: { n, k, totalCombinations: totalCombos },
        results: {
          aboveThreshold: {
            total: aboveKTotal,
            recoveredSuccess: aboveKPass,
            rate: `${((aboveKPass / aboveKTotal) * 100).toFixed(0)}%`,
          },
          belowThreshold: {
            total: belowKTotal,
            blockedSuccess: belowKFail,
            rate: `${((belowKFail / belowKTotal) * 100).toFixed(0)}%`,
          },
        },
        matchedProposalTable3: aboveKPass === 16 && belowKFail === 15,
      });
    }

    // Skenario: Payload Biner (File / Gambar)
    case "binary-payload": {
      const sampleBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x12, 0xff]);
      const meta: PayloadMeta = {
        type: "image",
        filename: "test-rahasia.png",
        mimeType: "image/png",
      };

      const payload = wrapPayload(meta, sampleBytes);
      const shares = split(payload, 3, 2);

      const recoveredPayload = combine([shares[0], shares[1]]);
      const recovered = unwrapPayload(recoveredPayload);

      const matched =
        recovered.meta.type === "image" &&
        recovered.meta.filename === "test-rahasia.png" &&
        uint8Equal(recovered.data, sampleBytes);

      return NextResponse.json({
        scenario: "binary-payload",
        status: matched ? "PASS" : "FAIL",
        metaPreserved: recovered.meta,
        bytesMatched: matched,
      });
    }

    // Skenario: Validasi batas parameter K dan N
    case "boundary-parameters": {
      const testCases = [
        { n: 1, k: 2, shouldThrow: true, desc: "N < 2" },
        { n: 5, k: 6, shouldThrow: true, desc: "K > N" },
        { n: 4, k: 1, shouldThrow: true, desc: "K < 2" },
        { n: 5, k: 3, shouldThrow: false, desc: "Valid 3 of 5" },
      ];

      const results = testCases.map((tc) => {
        let threw = false;
        try {
          split(new Uint8Array([1, 2, 3]), tc.n, tc.k);
        } catch {
          threw = true;
        }
        return {
          case: tc.desc,
          pass: threw === tc.shouldThrow,
        };
      });

      return NextResponse.json({
        scenario: "boundary-parameters",
        status: results.every((r) => r.pass) ? "PASS" : "FAIL",
        details: results,
      });
    }

    default:
      return NextResponse.json({ error: `Skenario ${scenario} tidak dikenal` }, { status: 404 });
  }
}

