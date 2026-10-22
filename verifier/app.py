from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field
from sympy import Function, Lambda, Symbol, diff, exp, cos, log, pi, simplify, sin, sqrt, tan
from sympy.core.function import AppliedUndef
from sympy.parsing.sympy_parser import (
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

app = FastAPI(
    title="PDE SymPy verifier",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

TRANSFORMS = standard_transformations + (implicit_multiplication_application,)
U = Function("u")
F = Function("F")
G = Function("G")
H = Function("H")
LOCALS = {
    "u": U,
    "F": F,
    "G": G,
    "H": H,
    "diff": diff,
    "sin": sin,
    "cos": cos,
    "tan": tan,
    "exp": exp,
    "log": log,
    "sqrt": sqrt,
    "pi": pi,
    **{name: Symbol(name, real=True) for name in (
        "x", "y", "z", "t", "r", "theta", "phi", "n", "L", "T",
        "alpha", "beta", "gamma", "c", "k", "a", "b", "rho", "mu",
    )},
}


class VerifyRequest(BaseModel):
    candidate: str = Field(min_length=1)
    pde: str | None = None
    conditions: list[str] = Field(default_factory=list)
    expected: str | None = None


class Check(BaseModel):
    name: str
    passed: bool
    detail: str | None = None


class VerifyResponse(BaseModel):
    status: str
    message: str
    residual: str | None = None
    checks: list[Check] = Field(default_factory=list)


def parse_expression(raw: str):
    text = raw.strip().strip("$").strip()
    text = text.replace("\\left", "").replace("\\right", "")
    return parse_expr(text, local_dict=LOCALS, transformations=TRANSFORMS)


def parse_equation(raw: str):
    text = raw.strip().strip("$").strip()
    if "=" in text:
        left, right = text.split("=", 1)
        return parse_expression(left) - parse_expression(right)
    return parse_expression(text)


def canonical_candidate(raw: str):
    text = raw.strip().strip("$").strip()
    if "=" in text:
        text = text.split("=", 1)[1]
    return parse_expression(text)


def zero_check(expression) -> tuple[bool, object]:
    simplified = simplify(expression)
    if simplified == 0:
        return True, simplified
    try:
        return simplified.equals(0) is True, simplified
    except Exception:
        return False, simplified


def truncate(value: object, limit: int = 500) -> str:
    text = str(value)
    return text if len(text) <= limit else text[: limit - 3] + "..."


@app.post("/verify", response_model=VerifyResponse)
def verify(request: VerifyRequest) -> VerifyResponse:
    try:
        candidate = canonical_candidate(request.candidate)
    except Exception as exc:
        return VerifyResponse(
            status="inconclusive",
            message=f"Could not parse candidate SymPy expression: {exc}",
        )

    # Evaluation mode: compare two SymPy expressions for mathematical equivalence.
    if request.expected:
        try:
            expected = parse_expression(request.expected)
        except Exception as exc:
            return VerifyResponse(
                status="inconclusive",
                message=f"Could not parse expected SymPy expression: {exc}",
            )
        passed, difference = zero_check(candidate - expected)
        return VerifyResponse(
            status="verified" if passed else "failed",
            message="Expressions are equivalent." if passed else "Expressions are not equivalent.",
            residual=truncate(difference),
        )

    if not request.pde:
        return VerifyResponse(
            status="inconclusive",
            message="No PDE was supplied for verification.",
        )

    try:
        pde_residual = parse_equation(request.pde)
    except Exception as exc:
        return VerifyResponse(
            status="inconclusive",
            message=f"Could not parse PDE SymPy expression: {exc}",
        )

    u_calls = [call for call in pde_residual.atoms(AppliedUndef) if call.func == U]
    if not u_calls:
        return VerifyResponse(
            status="inconclusive",
            message="PDE must reference the unknown function as u(x, t), u(x), or equivalent.",
        )

    base_call = max(u_calls, key=lambda call: len(call.args))
    candidate_function = Lambda(base_call.args, candidate)

    try:
        substituted = pde_residual.subs(U, candidate_function).doit()
        pde_ok, residual = zero_check(substituted)
    except Exception as exc:
        return VerifyResponse(
            status="inconclusive",
            message=f"SymPy could not substitute the candidate into the PDE: {exc}",
        )

    checks: list[Check] = []
    for index, condition in enumerate(request.conditions, start=1):
        if not condition.strip():
            continue
        try:
            condition_expr = parse_equation(condition)
            condition_value = condition_expr.subs(U, candidate_function).doit()
            condition_ok, condition_residual = zero_check(condition_value)
            checks.append(
                Check(
                    name=f"condition_{index}",
                    passed=condition_ok,
                    detail=f"{condition}: residual = {truncate(condition_residual)}",
                )
            )
        except Exception as exc:
            checks.append(
                Check(
                    name=f"condition_{index}",
                    passed=False,
                    detail=f"{condition}: could not verify ({exc})",
                )
            )

    conditions_ok = all(check.passed for check in checks)
    if pde_ok and conditions_ok:
        return VerifyResponse(
            status="verified",
            message="PDE residual simplifies to zero and all supplied conditions pass.",
            residual=truncate(residual),
            checks=checks,
        )

    message = (
        "PDE residual does not simplify to zero."
        if not pde_ok
        else "The PDE passes, but at least one boundary or initial condition fails."
    )
    return VerifyResponse(
        status="failed",
        message=message,
        residual=truncate(residual),
        checks=checks,
    )
