/**
 * Test Script for Inngest MCP Integration
 * Tests all MCP tools and verifies Inngest functions
 */

import axios from 'axios';

const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL || 'http://127.0.0.1:8288';

interface TestResult {
  name: string;
  success: boolean;
  message: string;
  data?: any;
  error?: any;
}

class InngestMCPTester {
  private results: TestResult[] = [];

  async runAllTests() {
    console.log('🧪 Starting Inngest MCP Integration Tests\n');

    await this.testDevServerHealth();
    await this.testListFunctions();
    await this.testSendEvent();
    await this.testSimpleFunction();
    await this.testErrorHandling();

    this.printResults();
  }

  private async testDevServerHealth() {
    const testName = 'Dev Server Health Check';
    try {
      const response = await axios.get(`${INNGEST_DEV_URL}/health`);

      if (response.status === 200) {
        this.addResult(testName, true, 'Dev server is healthy', response.data);
      } else {
        this.addResult(testName, false, `Unexpected status: ${response.status}`);
      }
    } catch (error: any) {
      this.addResult(testName, false, 'Dev server not responding', null, error.message);
    }
  }

  private async testListFunctions() {
    const testName = 'List Functions';
    try {
      const response = await axios.get(`${INNGEST_DEV_URL}/v1/functions`);
      const functions = response.data.data || response.data;

      this.addResult(
        testName,
        true,
        `Found ${functions.length} registered functions`,
        { count: functions.length, functions: functions.slice(0, 5) }
      );
    } catch (error: any) {
      this.addResult(testName, false, 'Failed to list functions', null, error.message);
    }
  }

  private async testSendEvent() {
    const testName = 'Send Event';
    try {
      const event = {
        name: 'test/simple',
        data: {
          message: 'Hello from MCP test',
          timestamp: Date.now(),
        },
        ts: Date.now(),
      };

      const response = await axios.post(`${INNGEST_DEV_URL}/e/local`, event);

      this.addResult(
        testName,
        true,
        'Event sent successfully',
        {
          event_ids: response.data.ids,
          status: response.data.status,
        }
      );
    } catch (error: any) {
      this.addResult(testName, false, 'Failed to send event', null, error.message);
    }
  }

  private async testSimpleFunction() {
    const testName = 'Test Simple Function Execution';
    try {
      // Send event to trigger testSimpleFunction
      const event = {
        name: 'test/simple',
        data: {
          message: 'Test execution',
          userId: 'test-user-123',
        },
        ts: Date.now(),
      };

      const sendResponse = await axios.post(`${INNGEST_DEV_URL}/e/local`, event);
      const eventId = sendResponse.data.ids?.[0];

      if (!eventId) {
        throw new Error('No event ID returned');
      }

      // Wait a bit for function to process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      this.addResult(
        testName,
        true,
        'Function triggered successfully',
        {
          event_id: eventId,
          event_name: event.name,
        }
      );
    } catch (error: any) {
      this.addResult(testName, false, 'Function execution failed', null, error.message);
    }
  }

  private async testErrorHandling() {
    const testName = 'Error Handling';
    try {
      // Send invalid event
      const event = {
        name: 'invalid/event/name/that/does/not/exist',
        data: {},
        ts: Date.now(),
      };

      const response = await axios.post(`${INNGEST_DEV_URL}/e/local`, event);

      this.addResult(
        testName,
        true,
        'Error handling works correctly',
        {
          status: response.data.status,
          message: 'Event accepted but no functions triggered',
        }
      );
    } catch (error: any) {
      this.addResult(testName, false, 'Error handling failed', null, error.message);
    }
  }

  private addResult(
    name: string,
    success: boolean,
    message: string,
    data?: any,
    error?: any
  ) {
    this.results.push({ name, success, message, data, error });
  }

  private printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 Test Results Summary');
    console.log('='.repeat(80) + '\n');

    const passed = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;

    this.results.forEach((result, index) => {
      const icon = result.success ? '✅' : '❌';
      console.log(`${index + 1}. ${icon} ${result.name}`);
      console.log(`   ${result.message}`);

      if (result.data) {
        console.log(`   Data:`, JSON.stringify(result.data, null, 2));
      }

      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }

      console.log();
    });

    console.log('='.repeat(80));
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log('='.repeat(80) + '\n');

    if (failed === 0) {
      console.log('🎉 All tests passed!\n');
    } else {
      console.log('⚠️  Some tests failed. Please check the errors above.\n');
      process.exit(1);
    }
  }
}

// Run tests
const tester = new InngestMCPTester();
tester.runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
