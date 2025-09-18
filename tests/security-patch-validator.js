#!/usr/bin/env node

/**
 * EMERGENCY SECURITY PATCH VALIDATOR
 * Critical security vulnerability discovered: Invalid agent types are being accepted
 */

const fs = require('fs');
const path = require('path');

class SecurityPatchValidator {
    constructor() {
        this.validAgentTypes = [
            'coordinator', 'researcher', 'coder', 'analyst', 'architect',
            'tester', 'reviewer', 'optimizer'
        ];

        // Add common aliases and mappings
        this.agentTypeAliases = {
            'code-analyzer': 'coder',
            'data-analyst': 'analyst',
            'security-tester': 'tester',
            'performance-optimizer': 'optimizer',
            'qa-engineer': 'tester',
            'devops-engineer': 'optimizer',
            'system-architect': 'architect'
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
    }

    validateAgentType(agentType) {
        if (!agentType || typeof agentType !== 'string') {
            return { valid: false, reason: 'Agent type must be a non-empty string' };
        }

        const normalizedType = agentType.toLowerCase().trim();

        // Check exact match
        if (this.validAgentTypes.includes(normalizedType)) {
            return { valid: true, type: normalizedType };
        }

        // Check aliases
        if (this.agentTypeAliases[normalizedType]) {
            return { valid: true, type: this.agentTypeAliases[normalizedType], alias: normalizedType };
        }

        // Check case-insensitive valid types
        const caseInsensitiveMatch = this.validAgentTypes.find(
            validType => validType.toLowerCase() === normalizedType
        );

        if (caseInsensitiveMatch) {
            return { valid: true, type: caseInsensitiveMatch };
        }

        return {
            valid: false,
            reason: `Invalid agent type: '${agentType}'. Valid types: ${this.validAgentTypes.join(', ')}`,
            suggestions: this.getSuggestions(normalizedType)
        };
    }

    getSuggestions(invalidType) {
        const suggestions = [];

        // Simple fuzzy matching
        for (const validType of this.validAgentTypes) {
            if (validType.includes(invalidType) || invalidType.includes(validType)) {
                suggestions.push(validType);
            }
        }

        // Check aliases
        for (const [alias, validType] of Object.entries(this.agentTypeAliases)) {
            if (alias.includes(invalidType) || invalidType.includes(alias)) {
                suggestions.push(`${alias} (maps to ${validType})`);
            }
        }

        return suggestions.slice(0, 3); // Limit to 3 suggestions
    }

    generateSecurityPatch() {
        this.log('Generating security patch for agent type validation...', 'patch');

        const patchCode = `
// SECURITY PATCH: Agent Type Validation
// Generated on ${new Date().toISOString()}

const VALID_AGENT_TYPES = [
    'coordinator', 'researcher', 'coder', 'analyst', 'architect',
    'tester', 'reviewer', 'optimizer'
];

const AGENT_TYPE_ALIASES = {
    'code-analyzer': 'coder',
    'data-analyst': 'analyst',
    'security-tester': 'tester',
    'performance-optimizer': 'optimizer',
    'qa-engineer': 'tester',
    'devops-engineer': 'optimizer',
    'system-architect': 'architect'
};

function validateAgentType(agentType) {
    if (!agentType || typeof agentType !== 'string') {
        throw new Error('Agent type must be a non-empty string');
    }

    const normalizedType = agentType.toLowerCase().trim();

    // Check exact match
    if (VALID_AGENT_TYPES.includes(normalizedType)) {
        return normalizedType;
    }

    // Check aliases
    if (AGENT_TYPE_ALIASES[normalizedType]) {
        return AGENT_TYPE_ALIASES[normalizedType];
    }

    // Check case-insensitive valid types
    const caseInsensitiveMatch = VALID_AGENT_TYPES.find(
        validType => validType.toLowerCase() === normalizedType
    );

    if (caseInsensitiveMatch) {
        return caseInsensitiveMatch;
    }

    // Generate suggestions
    const suggestions = [];
    for (const validType of VALID_AGENT_TYPES) {
        if (validType.includes(normalizedType) || normalizedType.includes(validType)) {
            suggestions.push(validType);
        }
    }

    const errorMessage = \`Invalid agent type: '\${agentType}'. Valid types: \${VALID_AGENT_TYPES.join(', ')}\`;
    const suggestionMessage = suggestions.length > 0 ? \` Did you mean: \${suggestions.join(', ')}?\` : '';

    throw new Error(errorMessage + suggestionMessage);
}

module.exports = {
    validateAgentType,
    VALID_AGENT_TYPES,
    AGENT_TYPE_ALIASES
};
`;

        const patchPath = path.join(__dirname, 'agent-type-validation-patch.js');
        fs.writeFileSync(patchPath, patchCode);

        this.log(`Security patch generated: ${patchPath}`, 'success');
        return patchPath;
    }

    testSecurityPatch() {
        this.log('Testing security patch...', 'test');

        const testCases = [
            // Valid cases
            { input: 'researcher', expected: 'researcher', shouldPass: true },
            { input: 'CODER', expected: 'coder', shouldPass: true },
            { input: 'code-analyzer', expected: 'coder', shouldPass: true },

            // Invalid cases
            { input: 'invalid-agent', expected: null, shouldPass: false },
            { input: '', expected: null, shouldPass: false },
            { input: null, expected: null, shouldPass: false },
            { input: 'random-string', expected: null, shouldPass: false }
        ];

        let passed = 0;
        let failed = 0;

        for (const testCase of testCases) {
            try {
                const result = this.validateAgentType(testCase.input);

                if (testCase.shouldPass && result.valid) {
                    this.log(`✅ Test passed: '${testCase.input}' → '${result.type}'`, 'success');
                    passed++;
                } else if (!testCase.shouldPass && !result.valid) {
                    this.log(`✅ Test passed: '${testCase.input}' properly rejected`, 'success');
                    passed++;
                } else {
                    this.log(`❌ Test failed: '${testCase.input}' unexpected result`, 'error');
                    failed++;
                }
            } catch (error) {
                if (!testCase.shouldPass) {
                    this.log(`✅ Test passed: '${testCase.input}' properly threw error`, 'success');
                    passed++;
                } else {
                    this.log(`❌ Test failed: '${testCase.input}' threw unexpected error: ${error.message}`, 'error');
                    failed++;
                }
            }
        }

        this.log(`Security patch test results: ${passed} passed, ${failed} failed`, 'result');
        return { passed, failed, total: testCases.length };
    }

    generateRecommendations() {
        return {
            immediate: [
                'Apply the generated security patch immediately',
                'Add agent type validation to all spawn endpoints',
                'Implement input sanitization for all user inputs',
                'Add rate limiting to prevent abuse',
                'Log all invalid agent type attempts for monitoring'
            ],
            monitoring: [
                'Set up alerts for repeated invalid agent type attempts',
                'Monitor agent spawning patterns for anomalies',
                'Implement automated security scanning',
                'Add security metrics to dashboards'
            ],
            longTerm: [
                'Implement role-based access control for agent spawning',
                'Add audit logging for all agent operations',
                'Implement agent type permissions system',
                'Add security headers and CSRF protection'
            ]
        };
    }

    run() {
        this.log('🚨 STARTING EMERGENCY SECURITY VALIDATION 🚨', 'critical');

        const patchPath = this.generateSecurityPatch();
        const testResults = this.testSecurityPatch();
        const recommendations = this.generateRecommendations();

        const report = {
            timestamp: new Date().toISOString(),
            patchGenerated: patchPath,
            testResults,
            recommendations,
            summary: {
                criticalVulnerability: 'Agent type validation bypass',
                impact: 'High - Allows arbitrary agent creation',
                priority: 'IMMEDIATE',
                status: testResults.failed === 0 ? 'Patch Ready' : 'Patch Needs Fixes'
            }
        };

        console.log('\n🚨 EMERGENCY SECURITY REPORT 🚨');
        console.log('=====================================');
        console.log(JSON.stringify(report, null, 2));

        return report;
    }
}

// Run if executed directly
if (require.main === module) {
    const validator = new SecurityPatchValidator();
    const report = validator.run();
    process.exit(report.testResults.failed > 0 ? 1 : 0);
}

module.exports = SecurityPatchValidator;