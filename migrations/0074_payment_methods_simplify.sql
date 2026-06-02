-- TER-1661: Simplify payment methods to cash, check, other.
-- Historical card/crypto/wire entries collapse to 'other' so existing audit
-- rows remain valid; the reference column on each payment retains the
-- original detail for any forensic recovery.
UPDATE payments SET method = 'other' WHERE method IN ('card', 'crypto', 'wire');
