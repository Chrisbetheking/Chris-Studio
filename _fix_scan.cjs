const fs = require('fs');
const L = function(hex){return Buffer.from(hex,'hex').toString('utf-8')};

const newFn = [
'function scanAndRedact(text: string): {',
'  flagged: boolean;',
'  sanitizedText: string;',
'  findings: SensitiveFinding[];',
'  details: string;',
'} {',
'  const MAX_SCAN_LENGTH = 8000;',
'  const MAX_FINDINGS = 20;',
'  const isZh = typeof tk === "function" && tk("common.yes") !== "Yes";',
'',
'  const original = String(text || "");',
'  const scanText = original.slice(0, MAX_SCAN_LENGTH);',
'',
'  // Safe patterns - all with /g flag',