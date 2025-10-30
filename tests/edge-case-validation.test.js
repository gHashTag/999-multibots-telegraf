#!/usr/bin/env node

/**
 * Edge Case Validation Test
 * Focus on testing the specific findings from the comprehensive test
 */

const { spawn } = require('child_process');

class EdgeCaseValidator {
    constructor() {
        this.findings = [];
    }

    log(message, type = 'info') {
        console.log(`[${new Date().toISOString()}] [${type.toUpperCase()}] ${message}`);
        this.findings.push({ message, type, timestamp: new Date() });
    }

    async runCommand(command, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const child = spawn('npx', ['claude-flow@alpha', ...command.split(' ')], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => stdout += data.toString());
            child.stderr.on('data', (data) => stderr += data.toString());

            const timer = setTimeout(() => {
                child.kill('SIGTERM');
                resolve({ timeout: true, stdout, stderr });
            }, timeout);

            child.on('close', (code) => {
                clearTimeout(timer);
                resolve({ code, stdout, stderr, success: code === 0 });
            });
        });
    }

    async testCriticalFinding() {
        this.log('CRITICAL FINDING VALIDATION: Invalid agent types are being accepted!', 'critical');

        const problematicCases = [
            'invalid-agent',
            'nonexistent-type',
            'random-string',
            '',
            'null'
        ];

        for (const agentType of problematicCases) {
            const result = await this.runCommand(`agent spawn ${agentType}`);

            if (result.success) {
                this.log(`🚨 SECURITY ISSUE: Invalid agent type '${agentType}' was accepted!`, 'critical');
            } else {
                this.log(`✅ Invalid agent type '${agentType}' properly rejected`, 'success');
            }
        }
    }

    async testCaseSensitivity() {
        this.log('Testing case sensitivity handling...', 'test');

        const caseCases = [
            'RESEARCHER',
            'Coder',
            'tEsTeR',
            'ANALYST'
        ];

        for (const agentType of caseCases) {
            const result = await this.runCommand(`agent spawn ${agentType}`);
            this.log(`Case test '${agentType}': ${result.success ? 'accepted' : 'rejected'}`, 'info');
        }
    }

    async testAgentTypeMapping() {
        this.log('Testing agent type mapping and aliases...', 'test');

        const mappingCases = [
            'code-analyzer',
            'data-analyst',
            'security-tester',
            'performance-optimizer'
        ];

        for (const agentType of mappingCases) {
            const result = await this.runCommand(`agent spawn ${agentType}`);

            if (result.success) {
                this.log(`✅ Agent type '${agentType}' mapped correctly`, 'success');
            } else {
                this.log(`❌ Agent type '${agentType}' failed mapping`, 'error');
            }
        }
    }

    async generateSecurityReport() {
        this.log('Generating security analysis...', 'report');

        const criticalFindings = this.findings.filter(f => f.type === 'critical');
        const securityIssues = this.findings.filter(f => f.message.includes('SECURITY ISSUE'));

        const report = {
            timestamp: new Date().toISOString(),
            criticalFindings: criticalFindings.length,
            securityIssues: securityIssues.length,
            recommendations: [
                'Implement strict agent type validation',
                'Add whitelist-based agent type checking',
                'Reject unknown agent types with clear error messages',
                'Add logging for invalid agent type attempts',
                'Implement rate limiting for agent spawning'
            ],
            urgentActions: securityIssues.length > 0 ? [
                'IMMEDIATE: Patch agent type validation',
                'IMMEDIATE: Add input sanitization',
                'IMMEDIATE: Implement security controls'
            ] : ['Continue monitoring']
        };

        console.log('\n=== SECURITY ANALYSIS REPORT ===');
        console.log(JSON.stringify(report, null, 2));

        return report;
    }

    async run() {
        await this.testCriticalFinding();
        await this.testCaseSensitivity();
        await this.testAgentTypeMapping();
        return this.generateSecurityReport();
    }
}

// Run if executed directly
if (require.main === module) {
    const validator = new EdgeCaseValidator();
    validator.run().then(report => {
        process.exit(report.securityIssues > 0 ? 1 : 0);
    });
}

module.exports = EdgeCaseValidator;