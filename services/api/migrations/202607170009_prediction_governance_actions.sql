-- Milestone E settlement adds reviewed operational events after resolution or
-- cancellation. Keep the governance log append-only while making the allowed
-- actions explicit rather than storing unvalidated free-form strings.

ALTER TABLE prediction_market_governance_events
    DROP CONSTRAINT prediction_market_governance_events_action_check;

ALTER TABLE prediction_market_governance_events
    ADD CONSTRAINT prediction_market_governance_events_action_check
    CHECK (
        action IN (
            'created',
            'submitted_for_review',
            'approved',
            'rejected',
            'opened',
            'closed',
            'resolved',
            'cancelled',
            'paused',
            'resumed',
            'settlement.plan',
            'settlement.confirmed',
            'refund.confirmed'
        )
    );
