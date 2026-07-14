-- Payout reconciliation must bind every transfer to the restricted source
-- account expected to submit the batch, not merely to recipient/amount data.
ALTER TABLE payout_rules
    ADD COLUMN source_account TEXT NOT NULL
        CHECK (source_account ~ '^G[A-Z2-7]{55}$');

ALTER TABLE payout_rules
    ADD CONSTRAINT payout_rule_source_is_not_recipient CHECK (
        source_account <> candidate_account
        AND source_account <> organizer_account
        AND source_account <> platform_account
    );
