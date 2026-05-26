-- GH #296: add index on contacts.email to speed up email-based lookups and dedup checks.
CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts(email);
