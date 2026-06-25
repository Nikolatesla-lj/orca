# Keep Orca view and runtime state outside ScryModel

`ScryModel` stores architecture truth only. Orca selection, expanded paths, active tabs, layout/render cache, retained flow-editor data, agent progress, and model edit leases live in Orca-owned state so UI mechanics do not pollute the agent-facing model.
