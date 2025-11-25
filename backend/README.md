
# AI Triage Assignment Engine

This backend service provides intelligent, real-time mapping of triaged patients to the most appropriate available doctors. The primary goals are to ensure correct specialty matching, minimize patient waiting time through load balancing, and prioritize emergency cases.

The engine is built with Python, FastAPI, and SQLModel, and uses the Hungarian algorithm (`scipy.optimize.linear_sum_assignment`) for batch optimizations.

## How It Works

The assignment process uses a cost-minimization model. The cost of assigning a patient `p` to a doctor `d` is calculated as:

`cost(p, d) = mismatch_cost + estimated_wait + load_penalty + shift_penalty`

- **Mismatch Cost**: A large penalty is applied if the doctor's specialty does not match the patient's diagnosed condition.
- **Estimated Wait**: Calculated as `doctor_queue_length * doctor_avg_service_time`. This is the core component for minimizing wait times.
- **Load Penalty**: A penalty is added if a doctor's current load is higher than the clinic's average, encouraging distribution of patients to less busy doctors.
- **Shift Penalty**: A penalty is applied if the doctor's shift is about to end.

**Emergency patients bypass standard scoring** and are immediately assigned to the first available, emergency-capable doctor.

## Configuration & Tuning

The behavior of the scoring algorithm can be tuned by modifying the constants in `backend/config.py`.

- `MISMATCH_PENALTY_SECONDS`: The effective "time" penalty for a specialty mismatch.
  - **To tune**: Increase this value to make specialty matching stricter. Decrease it if you prefer faster assignment over perfect matching (e.g., in a high-volume clinic where any available doctor is better than a long wait).

- `LOAD_PENALTY_WEIGHT_SECONDS`: The "time" penalty for each patient a doctor has above the clinic average.
  - **To tune**: Increase to make load balancing more aggressive. This will spread patients out more evenly, but may slightly increase wait times if it prioritizes an empty doctor over a more appropriate, slightly busy one. Decrease for less aggressive balancing.

- `CLINIC_DEFAULT_AVG_SERVICE_TIME_SECONDS`: The fallback service time if a doctor has no historical average.
  - **To tune**: Set this to your clinic's average consultation time in seconds (e.g., `1200` for 20 minutes).

- `SYMPTOM_TO_SPECIALTY`: Add or modify keywords and their associated specialties to improve the accuracy of the rule-based matching for your clinic's specific patient population.

## API Endpoints

The service exposes the following endpoints under the `/v1/assignment` prefix.

### `POST /assign/{session_id}`

Performs a real-time, greedy assignment for a single patient. This is typically called right after a patient's triage is complete.

**Returns**: The assigned doctor and a detailed breakdown of the scoring calculation.

```json
{
  "message": "Assignment successful",
  "session_id": "s1_emergency",
  "assigned_doctor": {
    "id": "d1",
    "name": "Dr. Eva Rostova",
    "specialty": "Cardiology"
  },
  "score_breakdown": {
    "total_cost": 1260.0,
    "spec_score": 1,
    "mismatch_cost": 0,
    "estimated_wait": 1200,
    "load_penalty": 60.0,
    "shift_penalty": 0,
    "proximity_penalty": 0
  },
  "latency_ms": "5.43"
}
```

### `POST /rebalance`

Triggers a batch re-optimization for all currently waiting patients. It uses the Hungarian algorithm to find the globally optimal set of assignments to minimize total system wait time. This can be called periodically (e.g., via a cron job every 60 seconds).

**Returns**: A list of the new optimal assignments.

## Running Tests

Unit tests are provided to validate the core logic of the specialty matching and cost calculation functions.

To run the tests, navigate to the project root and execute:

```bash
python -m unittest backend/tests/test_assignment.py
```
