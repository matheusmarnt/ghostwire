<?php

// tests/Browser/Fixtures/Legacy/LegacyWidgetFive.php

namespace Ghostwire\Tests\Browser\Fixtures\Legacy;

class LegacyWidgetFive extends LegacyBaseComponent
{
    public function render()
    {
        return view('ghostwire-fixtures::legacy.legacy-widget-five');
    }

    public function refreshBadge(): void {}
}
